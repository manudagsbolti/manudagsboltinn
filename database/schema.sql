-- Mánudagsboltinn V1
-- Run this entire file in Supabase SQL Editor on a new project.

create extension if not exists pgcrypto;
create extension if not exists btree_gist;

DO $$ BEGIN
  create type player_role as enum ('REGULAR', 'SUBSTITUTE');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create type season_status as enum ('PLANNED', 'ACTIVE', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create type session_status as enum ('DRAFT', 'ACTIVE', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create type mini_game_status as enum ('READY', 'RUNNING', 'PAUSED', 'FINISHED');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create type mini_game_end_reason as enum ('GOAL', 'TIME_EXPIRED');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create type game_event_type as enum ('GOAL', 'OWN_GOAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN
  create type timer_event_type as enum ('START', 'PAUSE', 'RESUME', 'EXPIRE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nickname text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  status season_status not null default 'PLANNED',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- A person's status can change during a season. Statistics always use the
-- role snapshotted on session_players for the actual date played.
create table if not exists player_role_periods (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  role player_role not null,
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists player_role_periods_lookup on player_role_periods(season_id, player_id, valid_from, valid_to);

create table if not exists sessions (
  id uuid primary key,
  season_id uuid not null references seasons(id) on delete restrict,
  session_date date not null,
  team_count smallint not null default 3 check (team_count in (2,3)),
  game_duration_seconds integer not null default 180 check (game_duration_seconds > 0),
  wins_required integer not null default 4 check (wins_required > 0),
  status session_status not null default 'DRAFT',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (season_id, session_date)
);

create table if not exists session_teams (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  team_code text not null check (team_code in ('A','B','C')),
  created_at timestamptz not null default now(),
  unique (session_id, team_code)
);

-- Team sizes are deliberately unconstrained: 4v4, 4v4v5, 5v5v5 etc. are valid.
create table if not exists session_players (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  team_id uuid not null references session_teams(id) on delete restrict,
  role_at_session player_role not null,
  present boolean not null default true,
  created_at timestamptz not null default now(),
  unique (session_id, player_id)
);
create index if not exists session_players_role_idx on session_players(session_id, role_at_session);

create table if not exists point_races (
  id uuid primary key,
  session_id uuid not null references sessions(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  winner_team_id uuid references session_teams(id) on delete restrict,
  final_wins jsonb not null default '{"A":0,"B":0,"C":0}'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, sequence_number)
);

create table if not exists mini_games (
  id uuid primary key,
  point_race_id uuid not null references point_races(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  team_1_id uuid not null references session_teams(id) on delete restrict,
  team_2_id uuid not null references session_teams(id) on delete restrict,
  waiting_team_id uuid references session_teams(id) on delete restrict,
  incumbent_team_id uuid references session_teams(id) on delete restrict,
  winner_team_id uuid references session_teams(id) on delete restrict,
  outgoing_team_id uuid references session_teams(id) on delete restrict,
  incoming_team_id uuid references session_teams(id) on delete restrict,
  end_reason mini_game_end_reason,
  status mini_game_status not null default 'READY',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  check (team_1_id <> team_2_id),
  unique (point_race_id, sequence_number)
);

create table if not exists game_events (
  id uuid primary key,
  mini_game_id uuid not null references mini_games(id) on delete cascade,
  event_type game_event_type not null,
  scoring_team_id uuid not null references session_teams(id) on delete restrict,
  scorer_player_id uuid not null references players(id) on delete restrict,
  assist_player_id uuid references players(id) on delete restrict,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (scorer_player_id is distinct from assist_player_id)
);
create index if not exists game_events_player_idx on game_events(scorer_player_id, occurred_at);
create index if not exists game_events_assist_idx on game_events(assist_player_id, occurred_at) where assist_player_id is not null;

create table if not exists timer_events (
  id uuid primary key,
  mini_game_id uuid not null references mini_games(id) on delete cascade,
  event_type timer_event_type not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists timer_events_game_idx on timer_events(mini_game_id, occurred_at);

-- Operational cache for offline recovery / full-device restore. Analytics should
-- use the normalized tables above, not this JSON snapshot.
create table if not exists session_snapshots (
  session_id uuid primary key references sessions(id) on delete cascade,
  payload jsonb not null,
  device_id text,
  updated_at timestamptz not null default now()
);

-- Admin allow-list. Authentication alone is not enough to access football data.
-- Bootstrap the first user from SQL Editor after creating/inviting the Auth user:
-- insert into public.app_admins(user_id) values ('AUTH-USER-UUID');
create table if not exists app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table app_admins enable row level security;
drop policy if exists "admins_can_see_self" on app_admins;
create policy "admins_can_see_self" on app_admins for select to authenticated
  using ((select auth.uid()) = user_id);
grant select on app_admins to authenticated;

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.app_admins a
    where a.user_id = (select auth.uid())
  );
$$;
revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

-- Row Level Security: authenticated users must also be explicitly allow-listed in app_admins.
alter table players enable row level security;
alter table seasons enable row level security;
alter table player_role_periods enable row level security;
alter table sessions enable row level security;
alter table session_teams enable row level security;
alter table session_players enable row level security;
alter table point_races enable row level security;
alter table mini_games enable row level security;
alter table game_events enable row level security;
alter table timer_events enable row level security;
alter table session_snapshots enable row level security;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['players','seasons','player_role_periods','sessions','session_teams','session_players','point_races','mini_games','game_events','timer_events','session_snapshots']
  LOOP
    EXECUTE format('drop policy if exists "admin_select" on %I', t);
    EXECUTE format('drop policy if exists "admin_insert" on %I', t);
    EXECUTE format('drop policy if exists "admin_update" on %I', t);
    EXECUTE format('drop policy if exists "admin_delete" on %I', t);
    -- Clean up policy names from earlier drafts too.
    EXECUTE format('drop policy if exists "authenticated_select" on %I', t);
    EXECUTE format('drop policy if exists "authenticated_insert" on %I', t);
    EXECUTE format('drop policy if exists "authenticated_update" on %I', t);
    EXECUTE format('drop policy if exists "authenticated_delete" on %I', t);
    EXECUTE format('create policy "admin_select" on %I for select to authenticated using ((select public.is_app_admin()))', t);
    EXECUTE format('create policy "admin_insert" on %I for insert to authenticated with check ((select public.is_app_admin()))', t);
    EXECUTE format('create policy "admin_update" on %I for update to authenticated using ((select public.is_app_admin())) with check ((select public.is_app_admin()))', t);
    EXECUTE format('create policy "admin_delete" on %I for delete to authenticated using ((select public.is_app_admin()))', t);
  END LOOP;
END $$;

grant select, insert, update, delete on players, seasons, player_role_periods, sessions, session_teams,
  session_players, point_races, mini_games, game_events, timer_events, session_snapshots to authenticated;

-- Useful analytical views. These intentionally use session_players.role_at_session,
-- so a player promoted mid-season keeps earlier substitute stats separated.
create or replace view v_player_session_stats with (security_invoker = true) as
select
  s.id as session_id,
  s.season_id,
  s.session_date,
  sp.player_id,
  p.name as player_name,
  sp.role_at_session,
  st.team_code,
  count(distinct mg.id) filter (where mg.id is not null) as mini_games,
  count(distinct mg.id) filter (where mg.winner_team_id = st.id) as wins,
  count(distinct pr.id) filter (where pr.winner_team_id = st.id) as sets,
  count(distinct ge.id) filter (where ge.event_type = 'GOAL' and ge.scorer_player_id = p.id) as goals,
  count(distinct ge.id) filter (where ge.assist_player_id = p.id) as assists,
  count(distinct ge.id) filter (where ge.event_type = 'OWN_GOAL' and ge.scorer_player_id = p.id) as own_goals
from sessions s
join session_players sp on sp.session_id = s.id and sp.present
join players p on p.id = sp.player_id
join session_teams st on st.id = sp.team_id
left join mini_games mg on mg.point_race_id in (select id from point_races where session_id = s.id)
  and (mg.team_1_id = st.id or mg.team_2_id = st.id)
left join point_races pr on pr.session_id = s.id
left join game_events ge on ge.mini_game_id in (select id from mini_games where point_race_id in (select id from point_races where session_id = s.id))
group by s.id, s.season_id, s.session_date, sp.player_id, p.name, sp.role_at_session, st.team_code;
