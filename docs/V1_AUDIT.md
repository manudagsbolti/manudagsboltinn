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
- Test deployed Supabase writes, deletes after Undo, reconnect and recovery on a disposable/test dataset. The new RPC path and guarded atomic local import have passed PostgreSQL/PGlite tests, including concurrent recording during downloads; a deployed Auth/PostgREST round trip remains pending.
- Migration 007 adds raw `session_snapshots` in the same transaction as normalized writes and retry receipts. The generated empty-project setup includes it.
- Migration 007 reconciles the `app_admins` allow-list with the active schema and enforces RLS. Do not combine this schema with the incompatible `database/schema.sql` from the unused app.
- Existing SQL analytics views do not implement V1 role-snapshot/own-goal splits. Migration 007 revokes frontend access and sets security-invoker; the active app derives its statistics locally.
- Older migration 004 reinterprets the previous 4×4 default, including historical records; this pre-existing behavior was not extended. Review actual historical data before applying migrations to a populated database.
- Backup restore does not reconstruct Undo actions. It clears stale Undo and uses strictly ordered outbox timestamps. The completed-set backup/upload regression passes; migration from unused AppState storage remains out of scope.
- Advanced analytics, AI, presentation features, balancing and aggregate historical entry already existed in the checkout. No new features in those areas were added; season selection was wired into existing consumers.

## Validation and deployment

The recorder, cloud sync and shared-access changes passed `npm run typecheck`, all 81 Vitest tests across 12 files, and `npm run build`. A subsequent expanded recorder fourth-win/Undo regression also passed the 19-test cloud suite. The build reports a non-fatal JavaScript chunk-size warning; PWA assets and service worker were generated successfully.

Tests execute the generated migrations against PostgreSQL/PGlite and cover atomic retries, recovery, backup upload, local changes during downloads, shared recorder isolation, role snapshots, forbidden history writes and privilege escalation. DOM tests cover password-only recorder login, separate admin login and guarded routes. Access transitions preserve pending writes and clear data from a previous access scope.

A read-only connection probe confirmed the locally supplied configuration reaches Supabase Auth and public signup is disabled. The user subsequently reported applying the initial setup and administrator membership. Migration 008 and the shared recorder Auth identity still require remote setup as documented in `docs/SETUP.md`. Apply only 008 to a project already running 001–007. No environment values were displayed.

Automated tests use fake IndexedDB and a DOM environment without cloud credentials. A deployed two-account Auth/PostgREST test and real-phone offline acceptance remain manual checks. No remote migration, Auth user creation or Cloudflare deployment was performed by the agent.
