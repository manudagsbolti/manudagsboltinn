# Mánudagsboltinn – V1 Product Specification

Status: source of truth for V1 product behaviour.

## 1. Purpose

Mánudagsboltinn is an offline-first web/PWA application for running a weekly indoor football session, recording live match events, and producing season/night statistics.

The primary design goal is **frictionless live operation**. One person should be able to operate the timer and record goals/assists from a phone without becoming a full-time scorekeeper.

The second goal is **high-quality historical data**: raw events should support season standings, substitutes, pair/trio analysis, career statistics, and later AI/advanced analytics.

## 2. Core entities

- **Season (Önn)** – editable named date range. Current defaults are Spring (January–April) and Autumn (September–December), with May–August off.
- **Player (Leikmaður)** – one persistent person across all seasons.
- **Role period** – player is `REGULAR` or `SUBSTITUTE` for a time range within a season.
- **Session (Boltkvöld)** – one night of football.
- **Session player** – attendance + team + immutable role snapshot for that night.
- **Session team** – A/B/C for that night.
- **Set** – race where the first team to 4 mini-game wins earns one set win.
- **Mini-game** – one continuous game of at most 3:00.
- **Game event** – goal / own goal, scorer, optional assist.
- **Timer event** – start, pause, resume, expire.

## 3. Player roles

There are exactly two roles:

- `REGULAR` / Fastamaður
- `SUBSTITUTE` / Varamaður

There is no third “guest” type.

### 3.1 Regulars

A season normally has 15 regular players. These 15 form the main internal season competition.

### 3.2 Substitutes

Any other player who fills in is a substitute. There may be many substitutes over a season.

A substitute may become a regular in a later season.

### 3.3 Mid-season role changes

Role normally changes only between Spring/Autumn seasons, but the system must support a change during a season (for example because of a long-term injury).

Role is therefore time-bound, not a permanent property on `players`.

Every `session_player` stores `role_at_session`. This is an immutable snapshot.
Exception confirmed by the owner: an administrator may explicitly correct a
mistaken snapshot for one draft/completed night, with a required reason and
history of previous/new roles and correction time. This never changes general
role periods, other nights or game facts. Normal role/date edits still preserve
snapshots. Shared recorders cannot correct snapshots or their history.

Example: a player plays five nights as substitute, then becomes regular. The first five nights remain substitute statistics forever; only later sessions count toward the regular competition.

## 4. Attendance and session setup

### Season settings (confirmed September 2026)

Operators can select, create and edit named seasons with explicit start/end dates.
Defaults are January 1–April 30 and September 1–December 31. May–August is off;
an operator may explicitly create a custom season to record an exception.
Changing season dates does not reassign existing sessions or rewrite their role snapshots.
Administrators manage seasons and their nights in “Annir og kvöld”, with saved
date ranges, night counts and warnings for nights outside an edited range.
Administrators may correct a draft/completed night's date and explicitly choose
its season. Live nights must be finished first. Corrections preserve all event
facts and role snapshots; moving a night changes which season includes it.
Player management displays both role names separately from explicit role-change
actions, confirms the effective date, and distinguishes active/inactive roster
visibility from REGULAR/SUBSTITUTE status. Viewing players does not create seasons.
Administrators may delete one draft/completed night after seeing its date and
season and typing EYÐA. Delete its attendance, backfill, teams, games, events,
role-correction history and Undo; preserve all players, seasons and other nights.
Queue the cloud delete offline and execute it atomically with retry receipts.
Shared recorders cannot delete a night. Live nights must be finished first.
Existing August–July records remain attached to their original season IDs.

### 4.1 Create session

Operator chooses the active season and creates a new session/date.

The app lists the season’s regular players first, with attendance selection.

The operator can then add one or more substitutes by searching existing players. If the person does not exist, create the player once and reuse the same player record in future sessions.

### 4.2 Team count and sizes

A session supports **2 or 3 teams**.

Team sizes are flexible and may be unequal. The application must not enforce equal team size.

Examples that must be supported:

- 4v4
- 5v5
- 4v4v4
- 4v4v5
- 5v4v4
- 5v5v5

Players are assigned freely to A/B or A/B/C.

Balanced/random team generation is optional later, not required for core V1.

## 5. Football rules

### 5.1 Mini-game duration

Each mini-game is at most **3 minutes (03:00)**.

A mini-game ends by either:

1. Goal
2. Timer expiry at 00:00

### 5.2 Goal with 3 teams

If A vs B are on court and A scores:

- A receives +1 mini-game win in the current set.
- A stays on court.
- B leaves.
- Waiting team C enters.
- A is incumbent / the team that has been on court longer for the next mini-game.
- The next timer is reset to 03:00 but remains `READY` until manually started.

### 5.3 Timeout with 3 teams

If 03:00 expires without a goal:

- No team receives a mini-game win.
- The team that has been on the court longer leaves.
- The other on-court team stays.
- The waiting team enters.
- The staying team is incumbent for the next mini-game.

If the system cannot know which team has been on court longer (typically the first timed-out mini-game), ask the operator to choose the outgoing team.

### 5.4 Two-team mode

With only A and B:

- Goal ends the mini-game and the scoring team gets +1 mini-game win.
- Timeout ends the mini-game without a win.
- No team rotation occurs.
- Same A vs B matchup returns to READY at 03:00.
- Operator manually starts the next mini-game.

### 5.5 Set rule

Each set starts at 0 wins for each team.

First team to **4 mini-game wins** wins the set.

When a team reaches 4:

- The set is closed.
- Winner gets +1 set win for the night.
- A new set begins with mini-game-win counters reset to 0.
- Court rotation/continuity continues from the preceding mini-game; do not arbitrarily reset teams unless operator explicitly changes setup.
- Next mini-game remains READY until Start.

## 6. Timer and state machine

The live timer has four primary states:

- `READY`
- `RUNNING`
- `PAUSED`
- `FINISHED`

Transitions:

- READY -> Start -> RUNNING
- RUNNING -> Pause -> PAUSED
- PAUSED -> Resume -> RUNNING
- RUNNING -> Goal -> FINISHED
- RUNNING -> 00:00 -> FINISHED
- FINISHED -> next matchup prepared -> READY

**No automatic READY -> RUNNING transition is allowed.**

### 6.1 Pause

Pause is a normal live feature. Injuries, stuck balls, discussion, etc. happen regularly.

Pause must freeze the remaining time exactly and may be used repeatedly.

### 6.2 Buzzer

At 00:00 play a clearly audible end-of-game buzzer/horn.

Provide a “test sound” action before play begins.

Device volume remains controlled by the device.

### 6.3 Timer implementation rule

Do not treat JavaScript interval ticks as elapsed-time truth.

Persist timestamps/start/pause information and derive remaining time from time differences. Browser throttling must not make the clock inaccurate.

### 6.4 Wake lock

While Live Mode is active, request a screen wake lock where supported. If the wake lock is lost when the app backgrounds, request it again when the app becomes active.

### 6.5 Crash/reload recovery

The live state is persisted locally after each meaningful change.

If the app reloads/crashes while a timer was RUNNING, recover the mini-game as **PAUSED**, showing the stored/reconstructed remaining time. Never silently continue the clock in the background after recovery.

## 7. Goal and assist recording

When a team scores:

1. Operator taps the scoring team button.
2. Timer stops immediately.
3. Select scorer from players on that team.
4. Select assist from other players on that team, or `No assist`.
5. Scorer may not assist themselves.
6. Save event.
7. Apply mini-game win and rotation.
8. Check whether the set has been won.
9. Show next matchup READY at 03:00.

### 7.1 Own goal

Goal flow must support `Own goal`.

- Select the own-goal player from the defending team.
- Goal is credited to the benefiting team score/event outcome.
- No assist is recorded.
- Preserve own-goal count separately for player statistics.

## 8. Undo and corrections

Live mode must offer a clear Undo for the most recent completed scoring/game action.

Undo must reverse the complete transaction, not only the visible goal:

- goal/event
- scorer/assist
- mini-game win
- rotation
- set completion if the goal was the 4th win
- next-match setup

Admin/history screens may later provide more granular editing of older events.

## 9. Live UI

Live Mode is the most important screen.

Priorities:

- large 03:00 countdown
- clear A/B/C current set wins
- clear current matchup
- indicate incumbent / team that has been on court longer
- very large Goal A / Goal B buttons
- large Pause/Resume action
- minimal distractions
- high contrast
- touch targets usable quickly with sweaty hands

After a mini-game ends, show the next matchup and a prominent `Start next game` button.

Do not color the entire substitute player name differently. Show substitute status with a small `V`/badge only.

## 10. Night summary

The app must make the current-night state available during play and show a clear final summary when the session ends.

### 10.1 Team summary

For each team show at least:

- mini-game wins (`Sigrar`)
- set wins (`Sett`)
- draws (`Jafntefli`): completed timeout games without a winner. Count once
  for the night and once for each on-court team/player; exclude the waiting team.
  Derive from raw games, including Undo. Aggregate-only backfills have unknown
  draws, displayed as — rather than zero. Draws award no mini-game or set win.
- Team cards center their totals and show each player on a separate line with
  goals scored for that roster. Own goals remain separate from player goals.

Also useful/allowed:

- goals
- mini-games played
- team size

### 10.2 Player summary

At the end of the night show per player at least:

- team
- role at session: regular/substitute
- mini-games participated in
- mini-game wins while on their team
- set wins while on their team
- goals
- assists
- G+A
- own goals

Derived win percentage may also be shown.

## 11. Season statistics

### 11.1 Main regular-player competition

The primary season standings/statistics are for regulars.

Only data earned in sessions where `role_at_session = REGULAR` counts toward this main competition.

If a player was a substitute earlier in the same season and later promoted, their earlier substitute stats do not move into the regular table.

### 11.2 Substitute statistics

Substitutes have a separate statistics view/table. Their appearances, wins/sets, goals, assists, G+A, etc. remain visible.

### 11.3 All players

An optional all-player view can combine all session data regardless of role.

### 11.4 Attendance

Regular attendance percentage is meaningful because regulars are expected members of the season roster.

Substitutes should primarily show appearances rather than a misleading “attendance percentage” unless an explicit invitation/eligibility denominator is later introduced.

## 12. Derived statistics and future analytics

Store facts; derive statistics.

The event model should make these possible without redesigning the source data:

- season standings
- regular/substitute/all filters
- mini-game win rate
- set wins
- goals
- assists
- G+A
- goals/mini-game
- assists/mini-game
- goal involvement
- pair performance
- trio performance
- court streaks / king-of-the-court runs
- form over last N nights
- career statistics across seasons
- historical role splits
- choke/nix statistics
- records and awards

### 12.1 Choke

Current V1 definition: a team loses a set after having reached one win short of the target (3 when target=4). Keep this as derived logic, not manually entered data. If historical definition proves different during legacy migration, reconcile deliberately rather than silently changing the rule.

### 12.2 Nix

Current V1 definition: a team finishes a lost set with 0 mini-game wins. Derived from set history.

## 13. Offline-first requirement

Offline operation is a hard requirement.

The local write path is:

1. User action
2. Persist to IndexedDB/local state
3. Update UI immediately
4. Attempt cloud sync afterward

Never make the live operator wait for Supabase/network before the action is accepted.

The following must work with no network connection:

- open installed app shell
- recover active local session
- Start
- Pause
- Resume
- goal/scorer/assist/own goal
- timer expiry
- rotation
- set win
- Undo
- current-night summary
- end session

## 14. Cloud sync and source of truth

Use Supabase Postgres/Auth for cloud persistence and historical access.

During live play, IndexedDB is the operational source of truth.

Each local record/event should have stable IDs so cloud synchronization can be idempotent/upsert-based.

Cloud connection state should be unobtrusive, e.g.:

- `Synced`
- `17 events waiting for sync`
- `Sync error – data safe on device`

Network error must never appear as a match-blocking modal.

V1 assumes one active live recorder device at a time. Real-time multi-device collaborative scoring is out of scope.

## 15. PWA and hosting

### Shared submission access (confirmed September 2026)

Recorders sign in with one shared password, choose any valid playing date,
record a night offline and explicitly submit the completed night for review.
No pre-opened date, season selection, person name or individual account is required.
Only local recordings and a player roster are visible to recorders; neither other
nights nor season statistics can be read through the UI or backend.

Submissions remain separate from approved raw facts. An administrator reviews
team/player/set results, corrects the date, selects the season and confirms or
changes player roles before approval. Only approved submissions enter season
statistics. Admin-created nights retain their existing direct recording flow.
Rejection keeps a receipt so retries do not re-open the submission. It does not
physically erase the rejected submission. Frozen submissions retry offline
without duplication; unsent nights prevent logout or switching accounts.
One device records each night. There is no person/device attribution UI.
See docs/SUBMISSION_REVIEW.md for setup, privacy and recovery details.

V1 is a web app/PWA, not a native App Store/Play Store application.

Baseline stack:

- React
- TypeScript
- Vite
- service worker + web app manifest
- Dexie/IndexedDB
- Supabase Postgres/Auth
- Cloudflare Workers Static Assets
- GitHub

The PWA should be installable to a phone home screen and usable standalone.

## 16. Database principles

Do not put permanent role on the `players` table.

Expected conceptual tables:

- `players`
- `seasons`
- `player_role_periods`
- `sessions`
- `session_players`
- `session_teams`
- `point_races` / `sets`
- `mini_games`
- `game_events`
- `timer_events`

`session_players.role_at_session` is mandatory historical context.

Do not store derived standings as authoritative source data when they can be recalculated from events.

## 17. Historical migration

Historical Excel/Google Sheets data from earlier seasons will be imported only after the live V1 schema is validated.

Do not invent event-level history that was never captured.

Import the highest-quality historical facts available per season and preserve original exports for audit.

Use the same persistent player identity across all seasons.

### 17.1 Aggregate-only session backfill

If a played session has team rosters, per-round team goal totals and player goal totals, but no exact mini-game order or assists, store those known aggregate facts with explicit `AGGREGATE` provenance. Do not manufacture mini-games, rotations, timestamps or assists.

For such a session, assists are **unknown/not recorded**, not zero and not equivalent to `No assist`. UI and exports must distinguish unavailable values from known zero values. Future live sessions continue to record scorer plus optional assist normally.

## 18. V1 acceptance scenarios

A V1 build is not considered core-ready until it can pass these scenarios on a real phone:

1. Create season/session.
2. Select regular attendance and add substitutes.
3. Create 2 or 3 teams, including unequal teams such as 4v4v5.
4. Start a 3:00 mini-game manually.
5. Pause, wait, resume without clock drift.
6. Record goal, scorer, assist.
7. Verify winner stays / loser leaves / waiting team enters.
8. Let timer expire; verify buzzer and correct incumbent rotation.
9. Verify next game remains READY until manual Start.
10. Reach four mini-game wins; verify one set win and current set reset.
11. Record no-assist and own-goal cases.
12. Undo a goal that caused a rotation/set completion and fully restore state.
13. Run 4v4 two-team mode without rotation.
14. Run 4v4v4, 4v4v5 and 5v5v5 three-team sessions.
15. View team night summary with wins and sets.
16. View end-of-night player summary.
17. Verify regular vs substitute stats are classified by role snapshot at that session.
18. Promote a substitute mid-season and verify earlier stats stay substitute.
19. Disable network and record at least 10 mini-games successfully.
20. Reload/reopen during an active match and recover as PAUSED.
21. Reconnect and sync cloud data successfully.

## 19. Explicitly out of scope for core V1

Do not delay the reliable live recorder for these features:

- native iOS/Android app
- video/AI camera analysis
- shots/xG/possession/tackles/saves
- multi-device collaborative live scoring
- advanced team-balancing algorithm
- Elo/TrueSkill/power ranking
- automated slide deck generation
- AI-generated awards/insights

The architecture should make later analytics possible, but V1 priority is a robust live football recorder and correct historical data.
