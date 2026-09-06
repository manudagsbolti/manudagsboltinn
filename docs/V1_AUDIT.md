# V1 implementation audit — September 2026

Authority: `AGENTS.md`, `docs/PRODUCT_SPEC.md`, and the user's confirmed editable season dates (January–April / September–December, May–August off).

## Repository and Git hygiene

Reviewed repository application sources, all documentation, build/PWA configuration, SQL migrations, the alternative schema, tests and dependency metadata. Environment files containing values were excluded from reads. Existing user edits were preserved.

At inspection, neither `.env.local` nor `node_modules` was tracked. `.env.local` was absent locally and `node_modules` was present. No index removals or working-tree deletion were needed. `.gitignore` now excludes environment variants, dependencies and coverage while allowing a blank `.env.example`. No credentials were displayed, and Git history was not rewritten.

## Active implementation

`src/main.tsx` mounts `src/App.tsx`; active screens live under `src/components`. Commands use `src/data/repository.ts`, `src/domain/rules.ts`, `src/domain/matchMachine.ts`, and `src/db/localDb.ts`. The existing `src/screens`, context provider, two older game engines, and alternative `database/schema.sql` are not the running app. Existing TypeScript exclusions for those older implementations remain; typecheck validates the active import graph and tests, not every archived source file.

| Requirement | Finding / result |
| --- | --- |
| 2 / 3 teams and flexible sizes | Repository tests cover 4v4, 5v5, 4v4v4, 4v4v5, 5v4v4, 5v5v5 and 3v6v4. Removed the UI's near-equal-size restriction; validate complete, unique attendance assignment. |
| Goal and own-goal rotation | Winner stays; loser waits; waiting team enters. Two-team results have no outgoing team. Next game is persisted READY, never automatically started. |
| Scorer / assist | Pause before selection. Reject self-assists, wrong teams, waiting-team goals and own-goal assists. Own goals credit the benefiting team and remain separate player facts. |
| Timeout | No win; known incumbent leaves. First game has no inferred incumbent. Require an on-court manual choice when unknown. Reject early expiry. |
| First to four | Fourth win closes one set and prepares the next with zero wins and continuing court order. |
| Undo | Persist complete action; reverse goals/assists, rotation, set completion and prepared next set/game, including its timer facts. Queue cloud deletes as well as restored rows. |
| Timer / recovery | Preserve fractional seconds, derive from timestamps. Reopen recovers RUNNING as PAUSED, including at zero, without manufacturing a completed game. Dexie v5 corrects the false incumbent on unfinished opening games only. |
| Offline writes | Commands and ordered outbox records share one local transaction; cloud runs afterward. Duplicate scoring is serialized; an outbox write failure rolls back the complete scoring command. Ten-game offline/reopen regression included. |
| Finish / summary | Finish at any game state. Cancel leaves the clock paused. Completed games remain counted, unfinished games remain facts without an invented result. Summary includes all required team/player measures and role badges. Roster changes are shown separately rather than merged solely by color. |
| Roles / seasons | Session snapshots survive promotion and season edits; tests cover regular/substitute splits. Seasons have editable dates and explicit selection. Current-season totals include completed games in unfinished sets. |

## Remaining gaps and manual checks

- Test real phones for audible buzzer, audio unlock, wake-lock release/reacquisition, installability, airplane-mode shell loading, ten recorded games and restart. DOM tests verify buzzer invocation, not speaker output. VitePWA produces the active generated service worker; the repository also contains an older hand-written worker.
- Test real Supabase upserts, deletes after Undo, reconnect and conflict behavior on a disposable/test dataset. The existing cloud pull can overwrite local rows if recording continues during a pull. Avoid treating this as verified reconciliation.
- The architecture's former `session_snapshots` claim describes the unused implementation. The active normalized sync path does not write that table, so the test-plan requirement for both snapshots and normalized rows remains unmet.
- `docs/SETUP.md` describes an admin allow-list, but active migrations 001–005 allow authenticated users and do not create `app_admins`. The alternative `database/schema.sql` has the allow-list but an incompatible model. Do not combine the two schemas. This deployment/security decision needs reconciliation before production cloud acceptance.
- Existing SQL analytics views do not implement the same role-snapshot/own-goal splits as the local V1 views. They must not be used as the regular competition's authoritative standings yet.
- Older migration 004 reinterprets the previous 4×4 default, including historical records; this pre-existing behavior was not extended. Review actual historical data before applying migrations to a populated database.
- Existing backup restore does not reconstruct Undo actions. Recovery tests in this change cover local database reopen, not backup round-trip or migration from the unused AppState storage.
- Advanced analytics, AI, presentation features, balancing and aggregate historical entry already existed in the checkout. No new features in those areas were added; season selection was wired into existing consumers.

## Validation and deployment

Final verification passed: `npm run typecheck`, all 52 Vitest tests across 8 files (including the database-upgrade regression), and `npm run build`. The production build generated `dist/sw.js` and its Workbox runtime with 14 precache entries (440.72 KiB). The generated app registers `/sw.js`. `git diff --check` also passed; `.env.local` and `node_modules` remain ignored and untracked. Tests and build required execution outside the sandbox because Vite's child-process startup is blocked there. Real phone and cloud acceptance checks listed above remain pending.

Run the full Vitest suite, typecheck and production build. Automated tests use fake IndexedDB and a DOM environment without cloud credentials. Apply `supabase/migrations/006_timer_precision.sql` before syncing fractional timer values to an existing Supabase deployment; it changes integer time fields to double precision without altering existing values. No cloud migration or deployment was performed as part of this audit.
