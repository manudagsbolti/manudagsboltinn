-- Derived inputs for the shared offline rating algorithm. No raw history access.
create function public.get_submission_ratings() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_app_admin() and not public.is_app_recorder() then
    raise exception 'Access denied' using errcode = '42501';
  end if;
  return (select coalesce(jsonb_agg(jsonb_build_object('season', to_jsonb(se), 'players', (
    select coalesce(jsonb_agg(to_jsonb(totals)), '[]'::jsonb) from (
      select player_id, sum(points) points, sum(sets_played) sets_played,
        sum(set_wins) set_wins, sum(contributions) contributions
      from (
        select sp.player_id,
          case when b.session_id is not null then coalesce((select sum(coalesce((r->'team_goals'->>('_' || lower(bt.team->>'code')))::int,0)) from jsonb_array_elements(b.rounds) r),0)
          else coalesce((select sum(floor((select count(*) from public.games g where g.set_id=st.id and g.status='completed' and g.winning_team_id=m.team_id)::numeric/s.wins_per_point)) from public.set_team_members m join public.sets st on st.id=m.set_id where st.session_id=s.id and m.player_id=sp.player_id),0) end points,
          case when b.session_id is not null then jsonb_array_length(b.rounds)
          else (select count(*) from public.set_team_members m join public.sets st on st.id=m.set_id where st.session_id=s.id and m.player_id=sp.player_id and (st.status='completed' or exists(select 1 from public.games g where g.set_id=st.id and g.started_at is not null))) end sets_played,
          case when b.session_id is not null then (select count(*) from jsonb_array_elements(b.rounds) r where coalesce((r->'team_goals'->>('_' || lower(bt.team->>'code')))::int,0)>=4 and not exists(select 1 from jsonb_array_elements(b.teams) other where other->>'code'<>bt.team->>'code' and coalesce((r->'team_goals'->>('_' || lower(other->>'code')))::int,0)>=coalesce((r->'team_goals'->>('_' || lower(bt.team->>'code')))::int,0)))
          else (select count(*) from public.set_team_members m join public.sets st on st.id=m.set_id where st.session_id=s.id and m.player_id=sp.player_id and st.winning_team_id=m.team_id) end set_wins,
          case when b.session_id is not null then coalesce((select (p->>'goals')::int from jsonb_array_elements(b.player_goals) p where p->>'player_id'=sp.player_id::text limit 1),0)
          else (select count(*) filter(where g.scorer_player_id=sp.player_id and g.event_type<>'OWN_GOAL') + count(*) filter(where g.assist_player_id=sp.player_id) from public.goals g join public.games ga on ga.id=g.game_id join public.sets st on st.id=ga.set_id where st.session_id=s.id and g.deleted_at is null) end contributions
        from public.sessions s join public.session_players sp on sp.session_id=s.id
        left join public.session_backfills b on b.session_id=s.id
        left join lateral (select team from jsonb_array_elements(b.teams) team where (team->'player_ids') ? sp.player_id::text limit 1) bt on true
        where s.season_id=se.id and s.status='completed'
      ) facts group by player_id
    ) totals
  ))), '[]'::jsonb) from public.seasons se);
end $$;
revoke all on function public.get_submission_ratings() from public, anon;
grant execute on function public.get_submission_ratings() to authenticated;
