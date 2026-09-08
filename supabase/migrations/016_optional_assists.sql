-- Missing/null values keep legacy recording enabled. Per-goal coverage survives
-- toggling the night setting without rewriting already recorded facts.
alter table public.sessions add column assists_enabled boolean default true;
alter table public.goals add column assists_recorded boolean default true;
