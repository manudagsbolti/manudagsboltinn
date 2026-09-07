-- Shared recording access. Apply after 007 on the existing project.
-- Authentication is Supabase Auth; a shared recorder is never an app_admin.
create table public.app_recorders (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.app_recorders enable row level security;
revoke all on public.app_recorders from public, anon, authenticated;
grant select on public.app_recorders to authenticated;
create policy own_recorder_membership on public.app_recorders for select to authenticated
  using (user_id = (select auth.uid()));

create function public.is_app_recorder() returns boolean
language sql stable security invoker set search_path = '' as $$
  select exists(select 1 from public.app_recorders where user_id = (select auth.uid()))
    and not public.is_app_admin();
$$;

create table public.recording_window (
  id boolean primary key default true check (id),
  played_on date not null,
  season_id uuid not null references public.seasons(id),
  is_open boolean not null default false
);
alter table public.recording_window enable row level security;
revoke all on public.recording_window from public, anon, authenticated;
grant select, insert, update, delete on public.recording_window to authenticated;
create policy admin_window on public.recording_window for all to authenticated
  using ((select public.is_app_admin())) with check ((select public.is_app_admin()));

create function public.is_recording_night(night date, season uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_app_recorder() and exists (
    select 1 from public.recording_window w
    where w.is_open and w.played_on = night and w.season_id = season
  );
$$;
create function public.can_access_session(session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_app_admin() or exists(select 1 from public.sessions s
    where s.id = session and public.is_recording_night(s.played_on, s.season_id));
$$;
create function public.can_access_set(set_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_app_admin() or exists(select 1 from public.sets s
    where s.id = set_id and public.can_access_session(s.session_id));
$$;
create function public.can_access_team(team_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_app_admin() or exists(select 1 from public.set_teams t
    where t.id = team_id and public.can_access_set(t.set_id));
$$;
create function public.can_access_game(game_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_app_admin() or exists(select 1 from public.games g
    where g.id = game_id and public.can_access_set(g.set_id));
$$;

create function public.get_app_access() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare w public.recording_window;
begin
  if public.is_app_admin() then return jsonb_build_object('role', 'admin'); end if;
  if not public.is_app_recorder() then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  select * into w from public.recording_window where is_open;
  return jsonb_build_object('role', 'recorder', 'playedOn', w.played_on, 'seasonId', w.season_id);
end $$;

create function public.set_recording_window(night date, season uuid, open boolean) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  if not public.is_app_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  if not exists(select 1 from public.seasons s where s.id = season
    and night >= s.starts_on and (s.ends_on is null or night <= s.ends_on)) then
    raise exception 'Date must belong to the selected season';
  end if;
  insert into public.recording_window(id, played_on, season_id, is_open)
  values (true, night, season, open)
  on conflict(id) do update set played_on = excluded.played_on, season_id = excluded.season_id, is_open = excluded.is_open;
end $$;

-- Roster metadata only, never historical membership or season results.
create function public.get_recorder_context() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare w public.recording_window;
begin
  if not public.is_app_recorder() then raise exception 'Recorder access required' using errcode = '42501'; end if;
  select * into w from public.recording_window where is_open;
  if w.season_id is null then return jsonb_build_object('seasons','[]'::jsonb,'player_role_periods','[]'::jsonb); end if;
  return jsonb_build_object(
    'seasons', jsonb_build_array(jsonb_build_object('id', w.season_id, 'name', 'Skráning',
      'starts_on', w.played_on, 'ends_on', w.played_on, 'is_active', true)),
    'player_role_periods', (select coalesce(jsonb_agg(to_jsonb(r)), '[]') from (
      select p.id, p.season_id, p.player_id, p.role, w.played_on as valid_from,
        w.played_on as valid_to, p.created_at, p.updated_at
      from public.player_role_periods p where p.season_id = w.season_id
        and p.valid_from <= w.played_on and (p.valid_to is null or p.valid_to >= w.played_on)
    ) r)
  );
end $$;

create policy recorder_players_read on public.players for select to authenticated
  using (public.is_app_recorder() and is_active);
create policy recorder_players_insert on public.players for insert to authenticated
  with check (public.is_app_recorder() and is_active);
create policy recorder_sessions on public.sessions for all to authenticated
  using (public.is_recording_night(played_on, season_id))
  with check (public.is_recording_night(played_on, season_id));
create policy recorder_attendance on public.session_players for all to authenticated
  using (public.can_access_session(session_id)) with check (public.can_access_session(session_id));
create policy recorder_sets on public.sets for all to authenticated
  using (public.can_access_session(session_id))
  with check (public.can_access_session(session_id) and (winning_team_id is null or public.can_access_team(winning_team_id)));
create policy recorder_teams on public.set_teams for all to authenticated
  using (public.can_access_set(set_id)) with check (public.can_access_set(set_id));
create policy recorder_members on public.set_team_members for all to authenticated
  using (public.can_access_set(set_id))
  with check (public.can_access_set(set_id) and public.can_access_team(team_id));
create policy recorder_games on public.games for all to authenticated
  using (public.can_access_set(set_id))
  with check (public.can_access_set(set_id) and public.can_access_team(holder_team_id)
    and public.can_access_team(challenger_team_id)
    and (waiting_team_id is null or public.can_access_team(waiting_team_id))
    and (incumbent_team_id is null or public.can_access_team(incumbent_team_id))
    and (winning_team_id is null or public.can_access_team(winning_team_id))
    and (exiting_team_id is null or public.can_access_team(exiting_team_id)));
create policy recorder_goals on public.goals for all to authenticated
  using (public.can_access_game(game_id))
  with check (public.can_access_game(game_id) and public.can_access_team(team_id));
create policy recorder_timer on public.timer_events for all to authenticated
  using (public.can_access_game(game_id)) with check (public.can_access_game(game_id));

-- A recorder selects attendance, not competition eligibility. Derive new role
-- snapshots from the administrator's periods and preserve them on updates.
create function public.protect_recorder_role_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if public.is_app_recorder() then
    if tg_op = 'UPDATE' then
      new.role_at_session := old.role_at_session;
    else
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
create trigger protect_recorder_role_snapshot before insert or update on public.session_players
  for each row execute function public.protect_recorder_role_snapshot();

alter table public.sync_operations add column user_id uuid default auth.uid() references auth.users(id);
create policy recorder_receipts on public.sync_operations for select to authenticated
  using (public.is_app_recorder() and user_id = (select auth.uid()));
create policy recorder_receipts_insert on public.sync_operations for insert to authenticated
  with check (public.is_app_recorder() and user_id = (select auth.uid()));

-- Every new callable helper has explicit privileges and a fixed search_path.
do $$ declare f regprocedure; begin
  foreach f in array array[
    'public.is_app_recorder()'::regprocedure,
    'public.is_recording_night(date,uuid)'::regprocedure,
    'public.can_access_session(uuid)'::regprocedure,
    'public.can_access_set(uuid)'::regprocedure,
    'public.can_access_team(uuid)'::regprocedure,
    'public.can_access_game(uuid)'::regprocedure,
    'public.get_app_access()'::regprocedure,
    'public.get_recorder_context()'::regprocedure,
    'public.set_recording_window(date,uuid,boolean)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- This definer writes recovery copies but never returns protected history.
create function public.refresh_accessible_snapshots() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_app_admin() and not public.is_app_recorder() then
    raise exception 'Access denied' using errcode = '42501';
  end if;
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
  ), now() from public.sessions s where public.can_access_session(s.id)
  on conflict (session_id) do update set payload = excluded.payload, updated_at = excluded.updated_at;
end $$;
revoke all on function public.refresh_accessible_snapshots() from public, anon;
grant execute on function public.refresh_accessible_snapshots() to authenticated;

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
      if t <> all(array['games','sets','timer_events']) then
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

create or replace function public.get_sync_state() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
declare result jsonb := '{}'::jsonb; t text; rows jsonb;
begin
  if not public.is_app_admin() and not public.is_app_recorder() then
    raise exception 'Admin access required' using errcode = '42501';
  end if;
  foreach t in array array['players','seasons','player_role_periods','sessions',
    'session_players','session_backfills','sets','set_teams','set_team_members',
    'games','goals','timer_events'] loop
    execute format('select coalesce(jsonb_agg(to_jsonb(r)), ''[]''::jsonb) from public.%I r', t) into rows;
    result := result || jsonb_build_object(t, rows);
  end loop;
  if public.is_app_recorder() then
    result := result || public.get_recorder_context();
  end if;
  return jsonb_build_object('schema_version', 1, 'tables', result);
end $$;
