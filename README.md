# Mánudagsboltinn V1

First offline-first vertical slice for the live recorder.

## Implemented in this slice

- React + TypeScript + Vite scaffold
- Installable PWA manifest and offline service-worker cache
- IndexedDB persistence of active session
- Safe reload recovery (running game returns paused)
- 3:00 countdown using timestamps rather than interval as source of truth
- Start, pause, resume
- Loud Web Audio buzzer at 00:00
- Screen Wake Lock best-effort support
- Manual start for every next mini-game
- Three-team king-of-the-court rotation
- First-time timeout ambiguity asks which team leaves
- Goal → scorer → assist flow
- Own goals
- Four wins → one session point → race resets to 0
- Undo of the most recent committed game result
- Regular/substitute role shown on players (`V` = varamaður), without recoloring the whole player name
- Team rosters are intentionally unconstrained: 4v4, 4v4v4, 5v5v5, 4v4v5 and other sizes work in the data/UI
- Current-night team summary: mini-game wins, sets, goals and games
- Current-night player summary: role, team, games, wins, sets, goals, assists, G+A and own goals
- 2-team mock mode and correct no-rotation timeout behavior
- Cloud PostgreSQL/Supabase schema draft in `database/schema.sql`

## Deliberately not connected yet

- Supabase/Auth/cloud sync
- Real season/player setup screens
- 2-team live UI flow
- Production stats/dashboard
- Historical import from 2022–2026

The live game engine is intentionally built before cloud integration.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
```

## Next build milestone

1. Replace mock teams with real `New session` setup, including arbitrary player counts per team.
2. Add a proper `Finish session` action that lands on the player/team summary.
3. Add local event queue and sync IDs.
4. Connect Supabase and Row Level Security.
5. Deploy preview build to Cloudflare.
