# Mánudagsboltinn – Codex instructions

This repository is the production codebase for **Mánudagsboltinn**, an offline-first PWA used to run and record a weekly indoor football/futsal session.

## Read first

Before making product or architecture changes, read these files in order:

1. `docs/PRODUCT_SPEC.md` – product rules and source of truth for V1 behaviour.
2. `docs/ARCHITECTURE.md` – technical architecture and offline/sync principles.
3. `docs/TEST_PLAN.md` – acceptance tests that must keep working.
4. `docs/SETUP.md` – local/Supabase/Cloudflare setup.
5. `docs/LEGACY_MIGRATION.md` – rules for importing historical data.

If existing code conflicts with `docs/PRODUCT_SPEC.md`, treat the product spec as authoritative unless the user explicitly changes a rule.

## Non-negotiable product rules

- The live match recorder must work fully offline. Network/Supabase must never block Start, Pause, Resume, goal, assist, timeout, rotation, set completion, Undo, or end-of-night summary.
- There are only two player roles: `REGULAR` (fastamaður) and `SUBSTITUTE` (varamaður).
- Player role is time-bound, normally per season but may change mid-season. Every session must snapshot `role_at_session`; historical stats must never change retroactively.
- A season normally has 15 regular players. Substitutes are unlimited and can become regulars in a later season.
- Sessions support either 2 or 3 teams and unequal team sizes. Never assume 4v4 only. Valid examples include 4v4, 4v4v4, 4v4v5, 5v5v5, 5v4v4, etc.
- A mini-game lasts 3:00. A goal ends it immediately; the scoring team stays on the court. With 3 teams, the losing team leaves and the waiting team enters.
- If 3:00 expires with no goal, no mini-game win is awarded. With 3 teams, the team that has been on court longer leaves. If incumbent is unknown (e.g. first timeout), ask the operator which team leaves.
- With 2 teams, there is no rotation; the same matchup becomes READY again after goal or timeout.
- First team to 4 mini-game wins wins the set. Track both mini-game wins and set wins for the night.
- The next mini-game must never start automatically. It always returns to `READY` at 03:00 and requires an explicit Start action.
- Timer must support Pause/Resume and an audible end buzzer. Use timestamps as truth; do not use interval tick count as truth.
- Goal recording must support scorer + optional assist + own goal. Scorer cannot assist self. Own goal has no assist.
- Live screen should be touch-friendly, high contrast, and optimized for quick operation in a sports hall.
- Substitute status must not color the whole player name. Use a small badge/indicator instead.

## Data principles

- Store raw facts/events; derive aggregates.
- Do not persist standings, win percentages, G+A, pair percentages, choke/nix totals, or similar aggregates as primary truth when they can be derived.
- Regular-player competition must include only statistics accumulated in sessions where `role_at_session = REGULAR`.
- Substitute statistics must remain separately queryable, even if the player later becomes regular.
- An “all players” view may combine both roles.

## Technology baseline

- React + TypeScript + Vite.
- PWA/service worker.
- IndexedDB via Dexie for operational local-first state.
- Supabase Postgres + Auth for cloud persistence/history.
- Cloudflare Workers Static Assets for hosting/deploy.
- GitHub as source control.
- No native App Store/Play Store requirement for V1.
- No cPanel-specific architecture.

## Development discipline

- Prefer small, understandable domain functions over UI-embedded rules.
- Keep game rotation/state-machine logic in the domain layer and unit-test it.
- Do not add a server dependency to the live loop.
- Preserve backward compatibility with locally stored sessions where practical; if schema migration is needed, implement explicit migration/versioning.
- Before declaring a task complete, run the available checks (`npm run typecheck`, tests if present, and `npm run build`) and report any failures honestly.
- Do not silently change football rules. If a rule is ambiguous, ask before encoding a new assumption.
