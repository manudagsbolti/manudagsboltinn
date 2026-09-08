# Acceptance / test plan

## Automated regression suite

- Captains: one randomly chosen member per team, independent of team draw mode.
  Verify C badges in setup/live, persistence through submission approval, and
  database rejection of captains outside their team. Subsequent sets draw again;
  reloads retain saved captains. Check long captain names on a narrow phone.

- Disable assist recording: choosing a normal scorer immediately saves one goal
  with no assist and unknown coverage. Re-enable: normal assist selection returns,
  earlier coverage and goals remain unchanged. Verify the setting and goal marker
  survive shared submission/approval and sync; display incomplete coverage.

- Game history: edit an older goal/timeout/own goal, insert/reorder/remove games,
  retain later matchups and set boundaries, update/remove the set winner, and
  reverse a correction with its timer events. Reject stale drafts, invalid
  scorers/assists, running timers and frozen submissions. Roll back facts and
  outbox together on failure. SQL tests verify immediate numbering constraints,
  active-goal uniqueness, audit sync and idempotent receipt retries.
- Phone acceptance: open Leikir og leiðréttingar during play, verify pause,
  preview a correction, cancel with no changes, confirm and continue manually.
  Repeat offline and inspect the corrected night after syncing on another device.

Run `npm test`, `npm run typecheck`, and `npm run build`.
Vitest uses an isolated fake IndexedDB and no local environment/cloud credentials.

GitHub Actions runs the same checks after `npm ci` on pushes to `full-v1` and
`main`, and on pull requests. The workflow is `.github/workflows/ci.yml`;
Node.js is pinned in `.node-version`. This CI workflow needs no Supabase or
Cloudflare secrets and does not deploy the app.

- `src/domain/*.test.ts`: rotation, first-to-four, timer precision, roster validation and season defaults.
- `src/data/repository.test.ts`: actual Dexie command path, unequal teams, goals/assists/own goals, timeout choice, set continuity, duplicate commands, Undo across a set boundary, ten games offline, reopen/recovery, immutable role snapshots, transaction rollback, completion and summary totals.
- `src/components/liveFlow.test.ts`: React goal-selection pause, assist save, first-timeout dialog/buzzer invocation, fourth-win reset/Undo, finish/cancel, and required summary columns.
- `src/services/cloudSync.test.ts`: actual PostgreSQL migrations via PGlite plus the real Dexie command path. Tests the generated empty-project SQL, admin/anonymous/non-admin permissions, no self-promotion, atomic batch rollback, lost-response retry receipts, snapshots, fourth-win Undo, two-team own goals, timer precision, role snapshots on fresh-device recovery, concurrent local changes/deletes during pull, malformed payload rollback, and unchanged-round-trip Undo.
- `src/services/autoSync.test.ts`: startup/sign-in/reconnect/interval retry and listener cleanup.
- `src/services/access.test.ts` and `src/components/accessFlow.test.ts`: shared-password entry, separate admin login, denied credentials, direct hash-route guards, offline cached access, no account switching/logout with pending writes, and removal of cached admin history.
- `cloudSync.test.ts` retains the deployed 001–010 contract as upgrade regression coverage. Its open-night recorder behavior is superseded by migration 011.
- `submissionReview.test.ts` runs the latest generated 001–011 setup: arbitrary-date offline recording, explicit queued submission, lost-response retry, idempotent approval, role selection, rejection, no recorder inbox/history access or approval, and atomic rollback of malformed submissions. Unapproved facts never enter normal season tables.
- Recorder UI: choose date without an open window or season selection, finish and explicitly send. Queued state survives reload. Admin opens Annir og kvöld → Bíður samþykktar, reviews teams/players/sets, chooses date/season/roles and approves or rejects. Verify on two separate browsers that neither recorder can download the other's night.
- Real device sound, wake lock, installed app shell and real Supabase reconciliation remain manual acceptance checks. A passing unit/DOM suite does not certify those scenarios.

## Finishing and seasons

- Finish from READY, RUNNING or PAUSED, including an unfinished set.
- Cancelling finish retains the session and leaves its timer paused.
- Finishing retains all completed games and events; unfinished games are preserved without a fabricated result, and unfinished sets have no winner.
- Show all players, including zeros, with team, session role, games, wins, sets, goals, assists, G+A and own goals.
- A prepared but unstarted set does not inflate played-set counts.
- Create/select/edit January–April, September–December or custom seasons. May–August has no automatic season.
- Editing season dates preserves recorded session membership and role snapshots.
- Open a saved custom season beginning August 31; the editor must show that saved date, not the September default. Warn about nights outside the edited range.
- Correct a manual night's date/season without altering backfill facts or attendance snapshots; queue the session change atomically. Reject invalid dates, dates outside the chosen season and live-night corrections.
- Show Fastamaður/Varamaður separately from change buttons; cancelled role changes write nothing, confirmed changes show the new role. Shared recorders cannot open the seasons route.

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
- Final whistle uses two short blasts and one long blast; use “Prófa lokahljóð” on the target phone to check audible quality and volume. Audio failure must not block timeout handling.
- reload while RUNNING recovers as PAUSED
- screen wake lock requested while live

## Events
- Timeout draws count once per night and only for the two on-court teams and
  their players, in both two- and three-team modes. Undo removes the draw.
  Backfill draws are unknown, not zero. Team cards show centered Sett/Sigrar/
  Jafntefli/Mörk and one player per line with roster-specific goals; own goals
  do not inflate scorer totals.
- goal + scorer + assist
- goal without assist
- own goal, no assist
- scorer cannot assist self
- undo after goal restores set score / rotation / event
- 4th win closes set, increments set count, resets current wins
- Live night overview shows all players' set wins and each team's goals/wins per set. Fourth goal retains the completed 4–0 set and displays the new READY set at 0–0; Undo removes it and restores 3–0. Own goals count for the benefiting team; deleted goals do not count.

## Roles
- Explicit admin correction changes one night's role snapshot only; requires a reason, preserves game facts/general role periods/other nights, and appends history when reversed. Live-night correction is rejected.
- Sync a correction and its history through actual PostgreSQL, reload locally and verify recovery snapshot; recorder upserts cannot overwrite the corrected role or history.
- regular plays -> stats under regular table
- substitute plays -> stats under substitute table
- player promoted mid-season -> old sessions remain substitute; new sessions regular

## Offline
- Delete a completed test night with pending edits; retry a lost cloud response and download again. The night, children and recovery snapshot stay deleted; players, season and another manual night survive. Delete the manual night and verify its backfill/attendance disappear too. Deny shared-recorder deletion via both RPC and direct SQL.
- From an open live night, choose Delete: timer pauses, confirmation shows the date, and cancellation preserves the facts. Only typing EYÐA and confirming deletes the night. Shared recorders can discard unsent local nights but not queued/submitted ones.
- start session online
- disable network
- record at least 10 mini-games
- close/reopen PWA and recover
- reconnect and sync
- cloud snapshot + normalized rows exist

- Before the first set, go back from team assignment to the roster, edit attendance, cancel and verify no attendance changes. Save a replacement player and verify the same session/date, retained role snapshots, fresh draw and synced composite-key deletion. Reject edits after a set exists and reject recorder access to the cloud delete.

- Compare recorder RPC rating inputs with admin ALL-role analytics for approved live and manual nights. Deny unauthorized access. Confirm cached ratings survive invalid downloads and recorders can draw offline using the season containing the night date.

- In admin and shared attendance selection, choose a substitute, select all regulars, then deselect all regulars: the substitute remains selected. Check date-bound roles, missing cache, and review season auto-selection/no-season placeholder.

- With both two and three teams, swap drawn team colors: membership and captains stay unchanged. Choose opening court order and confirm; the saved READY game uses that order. Automatic next-set rotation remains unchanged.
