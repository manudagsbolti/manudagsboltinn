-- Mánudagsboltinn V1
-- Run this whole file once in Supabase -> SQL Editor.
-- V1 assumption: 4 small wins = 1 point; first team to 4 points wins a set.
-- Both values live on sessions, so they can be changed later without corrupting history.

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nickname text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  starts_on date not null,
  ends_on date,
  is_active boolean not null default false
);

create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id) on delete set null,
  played_on date not null default current_date,
  status text not null default 'draft' check (status in ('draft','live','completed')),
  game_duration_seconds integer not null default 180 check (game_duration_seconds > 0),
  wins_per_point integer not null default 4 check (wins_per_point > 0),
  points_to_win_set integer not null default 4 check (points_to_win_set > 0),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.session_players (
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  primary key (session_id, player_id)
);

create table if not exists public.sets (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  set_no integer not null check (set_no > 0),
  status text not null default 'ready' check (status in ('ready','live','completed')),
  winning_team_id uuid,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, set_no)
);

create table if not exists public.set_teams (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.sets(id) on delete cascade,
  name text not null,
  color text not null,
  sort_order integer not null default 0,
  unique (set_id, sort_order)
);

alter table public.sets
  drop constraint if exists sets_winning_team_id_fkey;
alter table public.sets
  add constraint sets_winning_team_id_fkey
  foreign key (winning_team_id) references public.set_teams(id) on delete set null;

create table if not exists public.set_team_members (
  set_id uuid not null references public.sets(id) on delete cascade,
  team_id uuid not null references public.set_teams(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete restrict,
  primary key (team_id, player_id),
  unique (set_id, player_id)
);

create table if not exists public.games (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.sets(id) on delete cascade,
  game_no integer not null check (game_no > 0),
  holder_team_id uuid not null references public.set_teams(id) on delete restrict,
  challenger_team_id uuid not null references public.set_teams(id) on delete restrict,
  waiting_team_id uuid references public.set_teams(id) on delete set null,
  status text not null default 'ready' check (status in ('ready','live','paused','completed')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds integer not null default 180 check (duration_seconds > 0),
  remaining_seconds integer not null default 180 check (remaining_seconds >= 0),
  timer_started_at timestamptz,
  end_reason text check (end_reason is null or end_reason in ('goal','timeout','manual')),
  winning_team_id uuid references public.set_teams(id) on delete set null,
  exiting_team_id uuid references public.set_teams(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (set_id, game_no),
  check (holder_team_id <> challenger_team_id)
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games(id) on delete cascade,
  team_id uuid not null references public.set_teams(id) on delete restrict,
  scorer_player_id uuid not null references public.players(id) on delete restrict,
  assist_player_id uuid references public.players(id) on delete restrict,
  seconds_elapsed integer not null default 0 check (seconds_elapsed >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (assist_player_id is null or assist_player_id <> scorer_player_id)
);

create index if not exists idx_sessions_played_on on public.sessions(played_on desc);
create index if not exists idx_sets_session on public.sets(session_id, set_no);
create index if not exists idx_set_teams_set on public.set_teams(set_id);
create index if not exists idx_set_team_members_set on public.set_team_members(set_id, player_id);
create index if not exists idx_games_set on public.games(set_id, game_no);
create index if not exists idx_goals_game on public.goals(game_id);
create index if not exists idx_goals_scorer on public.goals(scorer_player_id);
create index if not exists idx_goals_assist on public.goals(assist_player_id);
create unique index if not exists idx_one_active_goal_per_game on public.goals(game_id) where deleted_at is null;

create or replace view public.v_set_team_stats as
select
  s.id as set_id,
  s.session_id,
  st.id as team_id,
  st.name as team_name,
  count(g.id) filter (where g.status = 'completed' and g.winning_team_id = st.id) as small_wins,
  floor((count(g.id) filter (where g.status = 'completed' and g.winning_team_id = st.id))::numeric / se.wins_per_point)::int as points,
  mod((count(g.id) filter (where g.status = 'completed' and g.winning_team_id = st.id))::int, se.wins_per_point) as progress_wins,
  (s.winning_team_id = st.id) as is_winner,
  (
    s.status = 'completed'
    and s.winning_team_id is distinct from st.id
    and floor((count(g.id) filter (where g.status = 'completed' and g.winning_team_id = st.id))::numeric / se.wins_per_point)::int = se.points_to_win_set - 1
  ) as is_choke,
  (
    floor((count(g.id) filter (where g.status = 'completed' and g.winning_team_id = st.id))::numeric / se.wins_per_point)::int = 0
  ) as is_zero_point_set
from public.sets s
join public.sessions se on se.id = s.session_id
join public.set_teams st on st.set_id = s.id
left join public.games g on g.set_id = s.id
  and g.winning_team_id = st.id
  and g.status = 'completed'
group by s.id, s.session_id, s.status, s.winning_team_id, st.id, st.name, se.wins_per_point, se.points_to_win_set;

create or replace view public.v_set_player_stats as
select
  sts.set_id,
  sts.session_id,
  stm.player_id,
  sts.team_id,
  sts.team_name,
  sts.small_wins,
  sts.points,
  sts.progress_wins,
  sts.is_winner,
  sts.is_choke,
  sts.is_zero_point_set,
  coalesce((
    select count(*)::int
    from public.goals go
    join public.games ga on ga.id = go.game_id
    where ga.set_id = sts.set_id and go.scorer_player_id = stm.player_id and go.deleted_at is null
  ), 0) as goals,
  coalesce((
    select count(*)::int
    from public.goals go
    join public.games ga on ga.id = go.game_id
    where ga.set_id = sts.set_id and go.assist_player_id = stm.player_id and go.deleted_at is null
  ), 0) as assists
from public.v_set_team_stats sts
join public.set_team_members stm on stm.team_id = sts.team_id and stm.set_id = sts.set_id;

create or replace view public.v_session_player_stats as
select
  sp.session_id,
  sp.player_id,
  p.name,
  coalesce(sum(sps.points), 0)::int as points,
  coalesce(sum(sps.goals), 0)::int as goals,
  coalesce(sum(sps.assists), 0)::int as assists,
  count(*) filter (where sps.is_choke)::int as chokes,
  count(*) filter (where sps.is_zero_point_set)::int as zero_point_sets,
  (coalesce(sum(sps.points), 0) = 0) as is_nix_day
from public.session_players sp
join public.players p on p.id = sp.player_id
left join public.v_set_player_stats sps
  on sps.session_id = sp.session_id and sps.player_id = sp.player_id
group by sp.session_id, sp.player_id, p.name;

-- RLS: V1 backend is locked to authenticated Supabase users.
-- The local PWA still runs without Supabase credentials; auth UI comes in the next build layer.
do $$
declare t text;
begin
  foreach t in array array['players','seasons','sessions','session_players','sets','set_teams','set_team_members','games','goals']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format('create policy authenticated_all on public.%I for all to authenticated using (true) with check (true)', t);
  end loop;
end $$;
