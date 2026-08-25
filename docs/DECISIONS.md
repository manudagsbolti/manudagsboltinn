# V1 frozen decisions

## Player status
There are exactly two roles: `REGULAR` (fastamaður) and `SUBSTITUTE` (varamaður).

- Usually 15 regulars per spring/autumn season.
- A substitute may become a regular in a later season.
- Role can exceptionally change mid-season (for example due to a long-term injury).
- `player_role_periods` represents the intended role over time.
- `session_players.role_at_session` is the immutable historical snapshot used by statistics.
- A player's events are always stored identically regardless of role.
- Main internal standings filter to events/sessions where `role_at_session = REGULAR`.
- Substitute statistics filter to `SUBSTITUTE`.
- Career/all-player analytics may include both.

## Live game
- 2 or 3 teams; V1 vertical slice currently demonstrates 3.
- A mini-game lasts 180 seconds.
- Goal ends the mini-game. Scoring team stays on and receives one mini-game win.
- With 3 teams the losing team leaves and waiting team enters.
- If time expires, no mini-game win is awarded. The team that has been on court longer leaves.
- If no incumbent exists yet, UI asks which team leaves.
- Four mini-game wins complete a point race and award one session point.
- Race wins reset to 0 after a point is awarded; court rotation continues.
- Every next mini-game starts in READY state and requires explicit user Start.
- Timer can be paused/resumed any number of times.

## Events
- Goal stores scorer + optional assist.
- Own goal stores opposing player as own-goal scorer and no assist.
- Derived statistics are not canonical source data.

## Offline
- Live game never waits on Supabase/network.
- State is stored in IndexedDB before cloud sync is introduced.
- Reload/crash recovers a RUNNING timer as PAUSED for safety.
