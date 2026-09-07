-- Aggregate-only entry for a played session where exact event order was not recorded.
-- The JSON contains known team rosters, per-round team goals and player goal totals.
-- It must never be expanded into invented mini-game events.
create table if not exists public.session_backfills (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  source_kind text not null default 'AGGREGATE' check (source_kind = 'AGGREGATE'),
  assists_recorded boolean not null default false check (assists_recorded = false),
  teams jsonb not null,
  rounds jsonb not null,
  player_goals jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.session_players add column if not exists team_code text check (team_code in ('A','B','C'));
alter table public.session_backfills enable row level security;
drop policy if exists authenticated_all on public.session_backfills;
create policy authenticated_all on public.session_backfills for all to authenticated using (true) with check (true);
grant select, insert, update, delete on public.session_backfills to authenticated;
