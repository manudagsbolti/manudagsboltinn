-- Only administrators may delete a night, including through direct REST calls.
create function public.guard_session_delete() returns trigger
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_app_admin() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  -- Remove game/event references before the session cascade removes teams.
  -- RESTRICT foreign keys otherwise depend on cascade trigger ordering.
  delete from public.games where set_id in
    (select id from public.sets where session_id = old.id);
  return old;
end $$;
revoke all on function public.guard_session_delete() from public, anon, authenticated;
create trigger guard_session_delete before delete on public.sessions
for each row execute function public.guard_session_delete();

create or replace function public.apply_sync_batch(operations jsonb) returns integer
language plpgsql security invoker set search_path = '' as $$
declare
  item jsonb; t text; body jsonb; columns_sql text; values_sql text;
  updates_sql text; keys_sql text; applied integer := 0;
begin
  if not public.is_app_admin() and not public.is_app_recorder() then
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
      if t <> all(array['games','sets','timer_events','sessions']) then
        raise exception 'Unsupported sync delete';
      end if;
      if public.is_app_recorder() and not (
        (t = 'games' and public.can_access_game((item->>'entity_id')::uuid)) or
        (t = 'sets' and public.can_access_set((item->>'entity_id')::uuid)) or
        (t = 'timer_events' and exists(select 1 from public.timer_events e
          where e.id = (item->>'entity_id')::uuid and public.can_access_game(e.game_id)))
      ) then raise exception 'Delete outside recording night' using errcode = '42501'; end if;
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

  perform public.refresh_accessible_snapshots();
  return applied;
end $$;
