-- Preserve sub-second pause/resume accuracy without changing existing values.
alter table public.games alter column remaining_seconds type double precision;
alter table public.goals alter column seconds_elapsed type double precision;
