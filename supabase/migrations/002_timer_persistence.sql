-- Safe upgrade if you already ran 001 from an earlier preview build.
alter table public.games add column if not exists remaining_seconds integer not null default 180;
alter table public.games add column if not exists timer_started_at timestamptz;
