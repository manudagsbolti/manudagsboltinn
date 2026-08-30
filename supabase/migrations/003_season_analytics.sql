-- Season analytics layer for presentation, awards and balancing.
-- Safe to run after 001 + 002.


-- Backfill season rows for any existing sessions. A season runs Aug 1 -> Jul 31.
with season_years as (
  select distinct (extract(year from played_on)::int - case when extract(month from played_on)::int < 8 then 1 else 0 end) as start_year
  from public.sessions
), windows as (
  select start_year, make_date(start_year,8,1) as starts_on, make_date(start_year+1,7,31) as ends_on
  from season_years
)
insert into public.seasons (name, starts_on, ends_on, is_active)
select start_year::text || '/' || right((start_year+1)::text,2), starts_on, ends_on, current_date between starts_on and ends_on
from windows w
where not exists (select 1 from public.seasons s where s.starts_on = w.starts_on and s.ends_on = w.ends_on);

update public.sessions se
set season_id = s.id
from public.seasons s
where se.season_id is null and se.played_on between s.starts_on and coalesce(s.ends_on, '9999-12-31'::date);

create or replace view public.v_season_player_stats as
with set_rollup as (
  select
    se.season_id,
    sps.player_id,
    count(*)::int as sets_played,
    coalesce(sum(sps.small_wins),0)::int as small_wins,
    coalesce(sum(sps.points),0)::int as points,
    count(*) filter (where sps.is_winner)::int as set_wins,
    count(*) filter (where sps.is_choke)::int as chokes,
    count(*) filter (where sps.is_zero_point_set)::int as zero_point_sets,
    coalesce(sum(sps.goals),0)::int as goals,
    coalesce(sum(sps.assists),0)::int as assists
  from public.v_set_player_stats sps
  join public.sessions se on se.id = sps.session_id
  where se.status = 'completed' and se.season_id is not null
  group by se.season_id, sps.player_id
), night_rollup as (
  select
    se.season_id,
    v.player_id,
    count(*)::int as nights,
    count(*) filter (where v.is_nix_day)::int as nix_days,
    max(v.points)::int as best_night_points,
    max(v.goals)::int as best_night_goals,
    max(v.assists)::int as best_night_assists
  from public.v_session_player_stats v
  join public.sessions se on se.id = v.session_id
  where se.status = 'completed' and se.season_id is not null
  group by se.season_id, v.player_id
)
select
  sr.season_id,
  sr.player_id,
  p.name,
  nr.nights,
  sr.sets_played,
  sr.small_wins,
  sr.points,
  sr.set_wins,
  sr.goals,
  sr.assists,
  (sr.goals + sr.assists)::int as goal_contributions,
  sr.chokes,
  sr.zero_point_sets,
  nr.nix_days,
  nr.best_night_points,
  nr.best_night_goals,
  nr.best_night_assists,
  round(sr.points::numeric / nullif(nr.nights,0), 2) as points_per_night,
  round(sr.points::numeric / nullif(sr.sets_played,0), 2) as points_per_set,
  round(sr.set_wins::numeric / nullif(sr.sets_played,0), 4) as set_win_rate,
  round(sr.chokes::numeric / nullif(sr.set_wins + sr.chokes,0), 4) as choke_rate
from set_rollup sr
join night_rollup nr on nr.season_id = sr.season_id and nr.player_id = sr.player_id
join public.players p on p.id = sr.player_id;

create or replace view public.v_season_totals as
select
  se.season_id,
  count(distinct se.id)::int as nights,
  count(distinct st.id)::int as sets,
  count(distinct g.id)::int as games,
  count(distinct go.id) filter (where go.deleted_at is null)::int as goals,
  count(distinct sp.player_id)::int as players
from public.sessions se
left join public.session_players sp on sp.session_id = se.id
left join public.sets st on st.session_id = se.id and st.status = 'completed'
left join public.games g on g.set_id = st.id
left join public.goals go on go.game_id = g.id
where se.status = 'completed' and se.season_id is not null
group by se.season_id;

-- Backend award leaders. The PWA calculates the same concepts locally for offline use.
create or replace view public.v_season_award_leaders as
with metrics as (
  select season_id, player_id, name, 'points'::text as award_key, points::numeric as metric_value from public.v_season_player_stats
  union all select season_id, player_id, name, 'set_wins', set_wins::numeric from public.v_season_player_stats
  union all select season_id, player_id, name, 'goals', goals::numeric from public.v_season_player_stats
  union all select season_id, player_id, name, 'assists', assists::numeric from public.v_season_player_stats
  union all select season_id, player_id, name, 'contributions', goal_contributions::numeric from public.v_season_player_stats
  union all select season_id, player_id, name, 'nix_days', nix_days::numeric from public.v_season_player_stats where nix_days > 0
  union all select season_id, player_id, name, 'chokes', chokes::numeric from public.v_season_player_stats where chokes > 0
  union all select season_id, player_id, name, 'zero_point_sets', zero_point_sets::numeric from public.v_season_player_stats where zero_point_sets > 0
), ranked as (
  select *, dense_rank() over (partition by season_id, award_key order by metric_value desc) as rank
  from metrics
)
select season_id, award_key, player_id, name, metric_value
from ranked
where rank = 1;
