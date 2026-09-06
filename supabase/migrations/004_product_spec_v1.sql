-- Bring the deployed schema in line with docs/PRODUCT_SPEC.md.
-- Raw event facts remain authoritative; all standings stay derived.

do $$ begin
  create type public.player_role as enum ('REGULAR', 'SUBSTITUTE');
exception when duplicate_object then null; end $$;

create table if not exists public.player_role_periods (
  id uuid primary key,
  season_id uuid not null references public.seasons(id) on delete cascade,
  player_id uuid not null references public.players(id) on delete cascade,
  role public.player_role not null,
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);
create index if not exists idx_role_period_lookup on public.player_role_periods(season_id, player_id, valid_from);

alter table public.session_players add column if not exists role_at_session public.player_role;
update public.session_players set role_at_session = 'SUBSTITUTE' where role_at_session is null;
alter table public.session_players alter column role_at_session set not null;

alter table public.games add column if not exists incumbent_team_id uuid references public.set_teams(id) on delete set null;
alter table public.goals add column if not exists event_type text not null default 'GOAL';
alter table public.goals drop constraint if exists goals_event_type_check;
alter table public.goals add constraint goals_event_type_check check (event_type in ('GOAL', 'OWN_GOAL'));
alter table public.goals drop constraint if exists goals_own_goal_assist_check;
alter table public.goals add constraint goals_own_goal_assist_check check (event_type <> 'OWN_GOAL' or assist_player_id is null);

create table if not exists public.timer_events (
  id uuid primary key,
  game_id uuid not null references public.games(id) on delete cascade,
  event_type text not null check (event_type in ('START','PAUSE','RESUME','EXPIRE')),
  occurred_at timestamptz not null
);
create index if not exists idx_timer_events_game on public.timer_events(game_id, occurred_at);

-- The V1 rule is exactly first to four mini-game wins.
alter table public.sessions alter column wins_per_point set default 1;
update public.sessions set wins_per_point = 1 where wins_per_point = 4 and points_to_win_set = 4;

alter table public.player_role_periods enable row level security;
alter table public.timer_events enable row level security;
drop policy if exists authenticated_all on public.player_role_periods;
create policy authenticated_all on public.player_role_periods for all to authenticated using (true) with check (true);
drop policy if exists authenticated_all on public.timer_events;
create policy authenticated_all on public.timer_events for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.player_role_periods, public.timer_events to authenticated;
