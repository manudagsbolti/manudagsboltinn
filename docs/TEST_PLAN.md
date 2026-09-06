# Acceptance / test plan

## Automated regression suite

Run `npm test`, `npm run typecheck`, and `npm run build`.
Vitest uses an isolated fake IndexedDB and no local environment/cloud credentials.

GitHub Actions runs the same checks after `npm ci` on pushes to `full-v1` and
`main`, and on pull requests. The workflow is `.github/workflows/ci.yml`;
Node.js is pinned in `.node-version`. This CI workflow needs no Supabase or
Cloudflare secrets and does not deploy the app.

- `src/domain/*.test.ts`: rotation, first-to-four, timer precision, roster validation and season defaults.
- `src/data/repository.test.ts`: actual Dexie command path, unequal teams, goals/assists/own goals, timeout choice, set continuity, duplicate commands, Undo across a set boundary, ten games offline, reopen/recovery, immutable role snapshots, transaction rollback, completion and summary totals.
- `src/components/liveFlow.test.ts`: React goal-selection pause, assist save, first-timeout dialog/buzzer invocation, fourth-win reset/Undo, finish/cancel, and required summary columns.
- Real device sound, wake lock, installed app shell and real Supabase reconciliation remain manual acceptance checks. A passing unit/DOM suite does not certify those scenarios.

## Finishing and seasons

- Finish from READY, RUNNING or PAUSED, including an unfinished set.
- Cancelling finish retains the session and leaves its timer paused.
- Finishing retains all completed games and events; unfinished games are preserved without a fabricated result, and unfinished sets have no winner.
- Show all players, including zeros, with team, session role, games, wins, sets, goals, assists, G+A and own goals.
- A prepared but unstarted set does not inflate played-set counts.
- Create/select/edit January–April, September–December or custom seasons. May–August has no automatic season.
- Editing season dates preserves recorded session membership and role snapshots.

## 3 lið
- 4v4v4
- 4v4v5
- 5v5v5
- mark: winner stays, loser out, waiting in
- timeout: incumbent out
- first timeout: manual outgoing choice
- next game remains READY until Start

## 2 lið
- 4v4 og 5v5
- mark closes mini-game, same matchup READY
- timeout closes mini-game, same matchup READY
- no outgoing/incoming rotation

## Timer
- 03:00 -> 00:00
- pause freezes exactly
- resume continues remaining duration
- buzzer at 00:00
- reload while RUNNING recovers as PAUSED
- screen wake lock requested while live

## Events
- goal + scorer + assist
- goal without assist
- own goal, no assist
- scorer cannot assist self
- undo after goal restores set score / rotation / event
- 4th win closes set, increments set count, resets current wins

## Roles
- regular plays -> stats under regular table
- substitute plays -> stats under substitute table
- player promoted mid-season -> old sessions remain substitute; new sessions regular

## Offline
- start session online
- disable network
- record at least 10 mini-games
- close/reopen PWA and recover
- reconnect and sync
- cloud snapshot + normalized rows exist
