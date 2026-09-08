-- App correction history travels with the existing atomic session sync and
-- frozen submissions. Old sessions need no backfill. This is not a security log.
alter table public.sessions add column game_corrections jsonb;
