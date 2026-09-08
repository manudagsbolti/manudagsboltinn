-- Persist random captain selection per set. Legacy teams remain unassigned.
alter table public.set_teams add column captain_player_id uuid;
-- Teams are inserted before memberships in sync/submission transactions.
alter table public.set_teams add constraint captain_is_team_member
  foreign key (id, captain_player_id)
  references public.set_team_members(team_id, player_id)
  deferrable initially deferred;
