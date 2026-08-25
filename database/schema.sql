-- Mánudagsboltinn V1 - canonical cloud schema draft for Supabase/PostgreSQL.
-- Live UI is offline-first; these tables are the cloud source of historical truth after sync.

create extension if not exists pgcrypto;

create type player_role as enum ('REGULAR', 'SUBSTITUTE');
create type season_status as enum ('PLANNED', 'ACTIVE', 'CLOSED');
create type session_status as enum ('DRAFT', 'ACTIVE', 'CLOSED');
create type mini_game_status as enum ('READY', 'RUNNING', 'PAUSED', 'FINISHED');
create type mini_game_end_reason as enum ('GOAL', 'TIME_EXPIRED');
create type game_event_type as enum ('GOAL', 'OWN_GOAL');
create type timer_event_type as enum ('START', 'PAUSE', 'RESUME', 'EXPIRE');

create table players (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  nickname text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table seasons (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  start_date date not null,
  end_date date not null,
  status season_status not null default 'PLANNED',
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

-- A player can change between regular/substitute during a season.
-- Historical stats are filtered by the role that was valid when each session was played.
create table player_role_periods (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  role player_role not null,
  valid_from date not null,
  valid_to date,
  created_at timestamptz not null default now(),
  check (valid_to is null or valid_to >= valid_from)
);

create index player_role_periods_lookup
  on player_role_periods(season_id, player_id, valid_from, valid_to);

create table sessions (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete restrict,
  session_date date not null,
  team_count smallint not null default 3 check (team_count in (2,3)),
  game_duration_seconds integer not null default 180 check (game_duration_seconds > 0),
  wins_required integer not null default 4 check (wins_required > 0),
  status session_status not null default 'DRAFT',
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (season_id, session_date)
);

-- Team roster sizes are intentionally unconstrained; teams do not need equal player counts.
create table session_teams (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  team_code text not null check (team_code in ('A','B','C')),
  created_at timestamptz not null default now(),
  unique (session_id, team_code)
);

-- role_at_session is an intentional immutable snapshot.
-- If a substitute becomes a regular later, this row must NOT change.
create table session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  player_id uuid not null references players(id) on delete restrict,
  team_id uuid references session_teams(id) on delete restrict,
  role_at_session player_role not null,
  present boolean not null default true,
  created_at timestamptz not null default now(),
  unique (session_id, player_id)
);

create index session_players_role_idx
  on session_players(session_id, role_at_session);

create table point_races (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions(id) on delete cascade,
  sequence_number integer not null check (sequence_number > 0),
  winner_team_id uuid references session_teams(id) on delete restrict,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (session_id, sequence_number)
);

create table mini_games (
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

create table game_events (
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

create index game_events_player_idx on game_events(scorer_player_id, occurred_at);
create index game_events_assist_idx on game_events(assist_player_id, occurred_at) where assist_player_id is not null;

create table timer_events (
  id uuid primary key,
  mini_game_id uuid not null references mini_games(id) on delete cascade,
  event_type timer_event_type not null,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index timer_events_game_idx on timer_events(mini_game_id, occurred_at);

-- Local clients generate UUIDs before network sync. Upserts should use these IDs,
-- making retries idempotent and safe after offline periods.
