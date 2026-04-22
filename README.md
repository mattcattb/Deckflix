# Deckflix

Deckflix is a Jackbox-style group movie picker with a Netflix-inspired lobby and a Tinder-like decision loop.

One screen acts as the shared display for the room. Players join from their own devices with a room code, set up their identity, and swipe through movies together until the group lands on something to watch.

## Current Shape

Right now the project is centered around a few core flows:

- create a room from the display
- join from phones or laptops with a room code
- keep lightweight per-room identity with anonymous room cookies
- build a movie pool from settings and available providers
- let players vote with quick swipe-style actions
- show the display a live view of players, progress, and results

The product direction is intentionally social-first and low-friction. Accounts can matter later, but the current experience is designed to work fast in a room without forcing signup.

## Stack

- `Bun` for the workspace, scripts, runtime, and tests
- `Hono` for the server API and realtime endpoints
- `React`, `Vite`, and `TanStack Router/Query` for the web app
- `Redis` for active room state, player state, and realtime coordination
- `Postgres` with `Drizzle` for persistent app data and auth-related tables
- `TMDB` as the current movie provider, with mock fallback behavior in development

## Core Separation

The repo is split into a small workspace:

- `packages/server`
  The backend for rooms, sessions, movie pool generation, swipe flow, realtime state, and provider integration.
- `packages/web`
  The display UI and the player controller UI.
- `packages/shared`
  Shared schemas, contracts, and domain types used by both server and web.

That separation is intentionally simple: server owns behavior, web owns presentation, and shared owns the contract between them.

## Local Development

1. Copy envs:

```bash
cp .env.example .env
cp packages/server/.env.example packages/server/.env
```

2. Start local services:

```bash
docker compose up -d
```

3. Install dependencies:

```bash
bun install
```

4. Start the app:

```bash
bun run dev
```

The server runs on `http://localhost:3100` and the web app on `http://localhost:4173`.

If `DATABASE_URL` or `REDIS_URL` are unset, the server defaults to:

```bash
DATABASE_URL=postgresql://postgres:postgres@localhost:15432/postgres
REDIS_URL=redis://localhost:16380
PORT=3100
VITE_API_URL=http://localhost:3100
```

If another project is already using those ports, override them in `.env` before starting:

```bash
POSTGRES_PORT=25432
REDIS_PORT=26380
DATABASE_URL=postgresql://postgres:postgres@localhost:25432/postgres
REDIS_URL=redis://localhost:26380
PORT=3200
VITE_API_URL=http://localhost:3200
BETTER_AUTH_URL=http://localhost:4273
CORS_ORIGINS=http://localhost:4273
```

## Scripts

- `bun run dev` - run all dev servers
- `bun run dev:server` - run the server only
- `bun run dev:web` - run the web app only
- `bun run build` - build the workspace
- `bun run --filter @deckflix/server test` - run server tests
- `bun run db:generate` - generate Drizzle files
- `bun run db:migrate` - run Drizzle migrations
- `bun run db:studio` - open Drizzle Studio

## Product Direction

The current product language is roughly:

- `Netflix` for identity, browsing, anticipation, and room atmosphere
- `Tinder` for fast choices, swipe feedback, momentum, and match-style payoff

That mix is the core idea behind Deckflix: a living-room movie game that feels social, visual, and quick to play.

## Planned Features

Near-term product ideas currently in scope:

- `Watchlist signals`
  Let users add movies to a watchlist, then use those titles as recommendation signals for future pool generation.
- `Profile icon selection`
  Give each player a Netflix-style profile tile on their device, with a randomly assigned icon first and manual selection before the game starts.
- `Player preference inputs`
  While waiting in the lobby, let players choose favorite genres, eras, tone, rating ranges, or a few liked movies, then feed that into pool selection.
- `Smarter caching`
  Improve caching around movie provider reads, recommendation inputs, derived pool candidates, and repeated room lookups so the experience feels faster and more stable.

Additional areas worth building into:

- richer lobby presence and player identity
- better shortlist and watch-next style surfaces
- stronger match and results moments
- more cinematic display presentation
- improved swipe feedback, undo behavior, and animation
- more robust recommendation and pool ranking logic
- optional account-based persistence later for profiles, history, and preferences

## Notes

- Games are currently anonymous-first for MVP.
- Better Auth is in the repo for future account-based features, but accounts are not required for the main room flow.
- TMDB can be replaced or expanded later as the movie/provider layer matures.
