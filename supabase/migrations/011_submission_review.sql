-- Shared recorders submit complete raw nights; only admin-approved facts enter
-- the normal tables. No person/device name is requested or stored.
create table public.night_submissions (
  id uuid primary key,
  receipt_token uuid not null,
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);
alter table public.night_submissions enable row level security;
revoke all on public.night_submissions from public, anon, authenticated;
grant select on public.night_submissions to authenticated;
create policy admin_read on public.night_submissions for select to authenticated
  using ((select public.is_app_admin()));

-- Remove the old open-date permissions, including direct table access.
do $$ declare p record; begin
  for p in select tablename, policyname from pg_policies
    where schemaname = 'public' and policyname like 'recorder_%'
  loop execute format('drop policy %I on public.%I', p.policyname, p.tablename); end loop;
end $$;
update public.recording_window set is_open = false;
revoke execute on function public.get_recorder_context(), public.set_recording_window(date,uuid,boolean) from authenticated;

create or replace function public.get_app_access() returns jsonb
language plpgsql stable security invoker set search_path = '' as $$
begin
  if public.is_app_admin() then return jsonb_build_object('role','admin'); end if;
  if public.is_app_recorder() then return jsonb_build_object('role','recorder','workflow','submission'); end if;
  raise exception 'Access denied' using errcode = '42501';
end $$;

create function public.get_submission_roster() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_recorder() and not public.is_app_admin() then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(p)), '[]'::jsonb)
    from public.players p where p.is_active);
end $$;

create function public.submit_night(submission_id uuid, receipt_token uuid, facts jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare existing public.night_submissions; k text;
begin
  if not public.is_app_recorder() then raise exception 'Recorder access required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(724019260);
  select * into existing from public.night_submissions where id = submission_id;
  if found then
    if existing.receipt_token is distinct from receipt_token then raise exception 'Invalid receipt'; end if;
    return existing.state;
  end if;
  if receipt_token is null or submission_id is null or octet_length(facts::text) > 5000000
    or facts->'session'->>'id' is distinct from submission_id::text
    or facts->'session'->>'status' is distinct from 'completed' then
    raise exception 'Invalid completed night';
  end if;
  foreach k in array array['players','attendance','sets','teams','memberships','games','goals','timer_events'] loop
    if jsonb_typeof(facts->k) is distinct from 'array' then raise exception 'Missing facts array'; end if;
  end loop;
  insert into public.night_submissions(id, receipt_token, payload) values (submission_id, receipt_token, facts);
  return 'pending';
end $$;

create function public.review_night(submission_id uuid, accept boolean, played_on date default null,
  season_id uuid default null, roles jsonb default '{}'::jsonb) returns text
language plpgsql security definer set search_path = '' as $$
declare item public.night_submissions; facts jsonb; t text; source_key text; row_data jsonb;
  player_row jsonb; chosen_role public.player_role; session_uuid uuid; new_session jsonb;
begin
  if not public.is_app_admin() then raise exception 'Admin access required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(724019260);
  select * into item from public.night_submissions where id = submission_id for update;
  if not found then raise exception 'Submission not found'; end if;
  if item.state <> 'pending' then return item.state; end if;
  if not accept then
    update public.night_submissions set state = 'rejected' where id = submission_id;
    return 'rejected';
  end if;
  if played_on is null or not exists(select 1 from public.seasons s where s.id = review_night.season_id
    and review_night.played_on >= s.starts_on and (s.ends_on is null or review_night.played_on <= s.ends_on)) then
    raise exception 'Choose date within season';
  end if;
  facts := item.payload;
  session_uuid := (facts->'session'->>'id')::uuid;
  if session_uuid is distinct from submission_id then raise exception 'Invalid night ID'; end if;
  -- Insert-only facts prevent a submitted ID from overwriting existing nights.
  for player_row in select value from jsonb_array_elements(facts->'players') loop
    insert into public.players(id, name, nickname, is_active)
      values ((player_row->>'id')::uuid, player_row->>'name', player_row->>'nickname', true)
      on conflict (id) do nothing;
  end loop;
  new_session := (facts->'session') || jsonb_build_object('season_id', season_id, 'played_on', played_on, 'status','completed');
  insert into public.sessions select r.* from jsonb_populate_record(null::public.sessions, new_session) r;
  for row_data in select value from jsonb_array_elements(facts->'attendance') loop
    if row_data->>'session_id' is distinct from session_uuid::text then raise exception 'Attendance outside night'; end if;
    if not exists(select 1 from jsonb_array_elements(facts->'players') p where p->>'id' = row_data->>'player_id') then raise exception 'Missing player'; end if;
    chosen_role := coalesce((roles->>(row_data->>'player_id'))::public.player_role,
      (select p.role from public.player_role_periods p where p.season_id = review_night.season_id
        and p.player_id = (row_data->>'player_id')::uuid and p.valid_from <= review_night.played_on
        and (p.valid_to is null or p.valid_to >= review_night.played_on)
        order by p.valid_from desc, p.created_at desc limit 1), 'SUBSTITUTE'::public.player_role);
    insert into public.session_players(session_id, player_id, role_at_session, team_code)
      values (session_uuid, (row_data->>'player_id')::uuid, chosen_role, row_data->>'team_code');
  end loop;
  foreach t in array array['sets','set_teams','set_team_members','games','goals','timer_events'] loop
    source_key := case t when 'set_teams' then 'teams' when 'set_team_members' then 'memberships' else t end;
    for row_data in select value from jsonb_array_elements(facts->source_key) loop
      if t = 'sets' then
        if row_data->>'session_id' is distinct from session_uuid::text then raise exception 'Set outside night'; end if;
      elsif t in ('set_teams','set_team_members','games') then
        if not exists(select 1 from jsonb_array_elements(facts->'sets') s where s->>'id' = row_data->>'set_id') then raise exception 'Row outside submitted sets'; end if;
      else
        if not exists(select 1 from jsonb_array_elements(facts->'games') g where g->>'id' = row_data->>'game_id') then raise exception 'Event outside submitted games'; end if;
      end if;
      execute format('insert into public.%I select r.* from jsonb_populate_record(null::public.%I, $1) r',t,t) using row_data;
    end loop;
  end loop;
  -- Cross-links must remain within the submitted night/set, not just exist.
  if exists(select 1 from public.games g join public.sets s on s.id = g.set_id where s.session_id = session_uuid and
    (not exists(select 1 from public.set_teams t where t.id = g.holder_team_id and t.set_id = g.set_id)
     or not exists(select 1 from public.set_teams t where t.id = g.challenger_team_id and t.set_id = g.set_id)
     or (g.waiting_team_id is not null and not exists(select 1 from public.set_teams t where t.id = g.waiting_team_id and t.set_id = g.set_id))
     or (g.winning_team_id is not null and not exists(select 1 from public.set_teams t where t.id = g.winning_team_id and t.set_id = g.set_id))
     or (g.exiting_team_id is not null and not exists(select 1 from public.set_teams t where t.id = g.exiting_team_id and t.set_id = g.set_id))
     or (g.incumbent_team_id is not null and not exists(select 1 from public.set_teams t where t.id = g.incumbent_team_id and t.set_id = g.set_id))))
    or exists(select 1 from public.set_team_members m join public.sets s on s.id = m.set_id where s.session_id = session_uuid and
      (not exists(select 1 from public.set_teams t where t.id = m.team_id and t.set_id = m.set_id)
       or not exists(select 1 from public.session_players sp where sp.session_id = session_uuid and sp.player_id = m.player_id)))
    or exists(select 1 from public.sets s where s.session_id = session_uuid and s.winning_team_id is not null and
      not exists(select 1 from public.set_teams t where t.id = s.winning_team_id and t.set_id = s.id))
    or exists(select 1 from public.goals go join public.games g on g.id = go.game_id join public.sets s on s.id = g.set_id
      where s.session_id = session_uuid and (not exists(select 1 from public.set_teams t where t.id = go.team_id and t.set_id = g.set_id)
      or not exists(select 1 from public.session_players sp where sp.session_id = session_uuid and sp.player_id = go.scorer_player_id)
      or (go.assist_player_id is not null and not exists(select 1 from public.session_players sp where sp.session_id = session_uuid and sp.player_id = go.assist_player_id))))
  then raise exception 'Invalid cross-night references'; end if;
  if jsonb_typeof(facts->'backfill') = 'object' then
    row_data := facts->'backfill';
    if row_data->>'session_id' is distinct from session_uuid::text then raise exception 'Backfill outside night'; end if;
    insert into public.session_backfills select r.* from jsonb_populate_record(null::public.session_backfills, row_data) r;
  end if;
  perform public.refresh_accessible_snapshots();
  update public.night_submissions set state = 'approved' where id = submission_id;
  return 'approved';
end $$;

revoke all on function public.get_submission_roster(), public.submit_night(uuid,uuid,jsonb), public.review_night(uuid,boolean,date,uuid,jsonb) from public, anon;
grant execute on function public.get_submission_roster(), public.submit_night(uuid,uuid,jsonb), public.review_night(uuid,boolean,date,uuid,jsonb) to authenticated;

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
  if public.is_app_recorder() then
    result := result || public.get_recorder_context();
  end if;
  return jsonb_build_object('schema_version', 1, 'tables', result);
end $$;
