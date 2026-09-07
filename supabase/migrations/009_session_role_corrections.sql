-- Explicit admin corrections; normal role changes still preserve snapshots.
-- The history travels with attendance through sync, snapshots and backups.
alter table public.session_players add column role_corrections jsonb
  check (role_corrections is null or jsonb_typeof(role_corrections) = 'array');

create or replace function public.protect_recorder_role_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_app_recorder() then
    if tg_op = 'UPDATE' then
      new.role_at_session := old.role_at_session;
      new.role_corrections := old.role_corrections;
    else
      new.role_corrections := null;
      select coalesce((select p.role from public.player_role_periods p
        where p.player_id = new.player_id and p.season_id = s.season_id
          and p.valid_from <= s.played_on and (p.valid_to is null or p.valid_to >= s.played_on)
        order by p.valid_from desc, p.created_at desc limit 1), 'SUBSTITUTE'::public.player_role)
      into new.role_at_session from public.sessions s where s.id = new.session_id;
    end if;
  end if;
  return new;
end $$;
revoke all on function public.protect_recorder_role_snapshot() from public, anon, authenticated;
