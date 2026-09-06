-- V1 cloud contract: one recorder, atomic ordered writes, retry receipts and
-- raw session recovery snapshots. Run after 001-006; no historical import.
create table if not exists public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_admins enable row level security;
revoke all on public.app_admins from public, anon, authenticated;
grant select on public.app_admins to authenticated;
create policy read_own_membership on public.app_admins for select to authenticated
  using (user_id = (select auth.uid()));

create or replace function public.is_app_admin() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists (select 1 from public.app_admins where user_id = (select auth.uid()));
$$;
revoke all on function public.is_app_admin() from public, anon;
grant execute on function public.is_app_admin() to authenticated;

create table public.sync_operations (
  id uuid primary key,
  applied_at timestamptz not null default now()
);
create table public.session_snapshots (
  session_id uuid primary key references public.sessions(id) on delete cascade,
  schema_version integer not null default 1 check (schema_version = 1),
  payload jsonb not null,
  updated_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['players','seasons','player_role_periods','sessions',
    'session_players','session_backfills','sets','set_teams','set_team_members',
    'games','goals','timer_events','sync_operations','session_snapshots'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists authenticated_all on public.%I', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('create policy admin_access on public.%I for all to authenticated using ((select public.is_app_admin())) with check ((select public.is_app_admin()))', t);
  end loop;
end $$;

-- Older analytics are not the V1 role-snapshot standings. Keep them out of the
-- browser API, and prevent owner-privilege views bypassing table RLS.
do $$ declare v text; begin
  foreach v in array array['v_set_team_stats','v_set_player_stats',
    'v_session_player_stats','v_season_player_stats','v_season_totals',
    'v_season_award_leaders'] loop
    execute format('alter view public.%I set (security_invoker = true)', v);
    execute format('revoke all on public.%I from public, anon, authenticated', v);
  end loop;
end $$;

-- A restored completed set may precede its teams within a single batch.
alter table public.sets alter constraint sets_winning_team_id_fkey
  deferrable initially deferred;

create or replace function public.get_sync_state() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb := '{}'::jsonb; t text; rows jsonb;
begin
  if not public.is_app_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  foreach t in array array['players','seasons','player_role_periods','sessions',
    'session_players','session_backfills','sets','set_teams','set_team_members',
    'games','goals','timer_events'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.%I r', t) into rows;
    result := result || jsonb_build_object(t, rows);
  end loop;
  return jsonb_build_object('schema_version', 1, 'tables', result);
end $$;

create or replace function public.apply_sync_batch(operations jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb; t text; body jsonb; columns_sql text; values_sql text;
  updates_sql text; keys_sql text; applied integer := 0;
begin
  if not public.is_app_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  if jsonb_typeof(operations) is distinct from 'array' then
    raise exception 'Expected operations array';
  end if;
  -- Serialize retries from separate tabs/devices before checking receipts.
  perform pg_advisory_xact_lock(724019260);
  for item in select value from jsonb_array_elements(operations) loop
    if exists (select 1 from public.sync_operations where id = (item->>'id')::uuid) then
      continue;
    end if;
    t := item->>'table';
    if t is null or t <> all(array['players','seasons','player_role_periods',
      'sessions','session_players','session_backfills','sets','set_teams',
      'set_team_members','games','goals','timer_events']) then
      raise exception 'Unsupported sync table';
    end if;
    if item->>'operation' = 'delete' then
      -- Current recorder deletes only these parent/event records. Cascades
      -- remove their children, including prepared games after Undo.
      if t <> all(array['games','sets','timer_events']) then
        raise exception 'Unsupported sync delete';
      end if;
      execute format('delete from public.%I where id = $1', t)
        using (item->>'entity_id')::uuid;
    elsif item->>'operation' = 'upsert' then
      body := item->'payload';
      if jsonb_typeof(body) is distinct from 'object' or body = '{}'::jsonb then
        raise exception 'Expected row object';
      end if;
      keys_sql := case t
        when 'session_players' then 'session_id, player_id'
        when 'set_team_members' then 'team_id, player_id'
        when 'session_backfills' then 'session_id'
        else 'id' end;
      -- Only supplied columns are inserted: omitted values retain SQL defaults.
      -- Identifiers are quoted, table names allow-listed, data is parameterized.
      select string_agg(format('%I', key), ', ' order by key),
        string_agg(format('r.%I', key), ', ' order by key),
        string_agg(format('%I = excluded.%I', key, key), ', ' order by key)
        into columns_sql, values_sql, updates_sql from jsonb_object_keys(body) key;
      execute format('insert into public.%I (%s) select %s from jsonb_populate_record(null::public.%I, $1) r on conflict (%s) do update set %s',
        t, columns_sql, values_sql, t, keys_sql, updates_sql) using body;
    else
      raise exception 'Unsupported sync operation';
    end if;
    insert into public.sync_operations(id) values ((item->>'id')::uuid);
    applied := applied + 1;
  end loop;

  -- A disposable recovery copy of raw facts, never primary aggregate truth.
  -- Rebuilt in this transaction, so it cannot describe half an action.
  insert into public.session_snapshots(session_id, payload, updated_at)
  select s.id, jsonb_build_object(
    'session', to_jsonb(s),
    'season', (select to_jsonb(se) from public.seasons se where se.id = s.season_id),
    'players', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from public.players p
      join public.session_players sp on sp.player_id = p.id where sp.session_id = s.id),
    'session_players', (select coalesce(jsonb_agg(to_jsonb(sp)), '[]') from public.session_players sp where sp.session_id = s.id),
    'session_backfills', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from public.session_backfills b where b.session_id = s.id),
    'sets', (select coalesce(jsonb_agg(to_jsonb(st)), '[]') from public.sets st where st.session_id = s.id),
    'set_teams', (select coalesce(jsonb_agg(to_jsonb(team_row)), '[]') from public.set_teams team_row join public.sets st on st.id = team_row.set_id where st.session_id = s.id),
    'set_team_members', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.set_team_members m join public.sets st on st.id = m.set_id where st.session_id = s.id),
    'games', (select coalesce(jsonb_agg(to_jsonb(g)), '[]') from public.games g join public.sets st on st.id = g.set_id where st.session_id = s.id),
    'goals', (select coalesce(jsonb_agg(to_jsonb(go)), '[]') from public.goals go join public.games g on g.id = go.game_id join public.sets st on st.id = g.set_id where st.session_id = s.id),
    'timer_events', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from public.timer_events e join public.games g on g.id = e.game_id join public.sets st on st.id = g.set_id where st.session_id = s.id)
  ), now() from public.sessions s
  on conflict (session_id) do update set payload = excluded.payload, updated_at = excluded.updated_at;
  return applied;
end $$;

revoke all on function public.get_sync_state() from public, anon;
revoke all on function public.apply_sync_batch(jsonb) from public, anon;
grant execute on function public.get_sync_state(), public.apply_sync_batch(jsonb) to authenticated;
