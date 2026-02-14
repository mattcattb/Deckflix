# Movie Tinder

Movie tinder allows for quick swiping and such for users to help choose between movies

## Core Features

1. Friends can join room with room code
2. room settings filtering configs for movies
3. Swipe View (like, dislike, optional, SUPER LIKE) for choosing movies
4. Card View for movies (description, image, score, etc)
5. Rudamentary Recomendation system for users (maybe an account or lettrbox integration idk)
6. Streaming service locations for movies perhaps

## Some Features

1. Rooms for joining and setting preferences (prefered genres, star limits, etc)
2. Swiping features, with selection algorithms and prefence matching
3. Integration with a movie db api for getting movies to show
4. Room view during selection shows room cards with teh most swipes and likes as well as trashed ones just for some ideas
5. swiping options for like, dislike, maybe, and skip
6. Maybe some config settings like how many people need to like it or not (later features )

## Quick Start

1. Copy envs:

```
cp .env.example .env
cp packages/server/.env.example packages/server/.env
```

2. Install dependencies:

```
bun install
```

3. Start dev servers:

```
bun run dev
```

The server runs on `http://localhost:3000` and the web app on `http://localhost:5173`.

## Auth Routes

Better Auth is mounted at `/api/auth` and supports:

- `POST /api/auth/sign-up/email`
- `POST /api/auth/sign-in/email`
- `POST /api/auth/sign-out`
- `GET /api/auth/session`

## Example API (Projects)

Authenticated routes (require session cookie):

- `GET /api/projects` - list projects
- `POST /api/projects` - create project `{ "name": "My Project" }`

## Movie Rooms (Core MVP)

Current room features are intentionally in-memory so you can iterate quickly
before deciding on DB schema/auth strategy.

### Room REST API

- `POST /api/rooms` - create room
  - body: `{ "displayName": "Matt", "settings": { "minLikesToMatch": 2 } }`
  - returns room snapshot + member session (`memberId`, `sessionToken`)
- `POST /api/rooms/:roomCode/join` - join room
  - body: `{ "displayName": "Friend" }`
  - returns room snapshot + member session
- `GET /api/rooms/:roomCode` - fetch room snapshot

### Room WebSocket

- `GET /api/rooms/:roomCode/ws?memberId=...&sessionToken=...`
- Client messages:
  - `{ "type": "ping" }`
  - `{ "type": "movie.swipe", "payload": { "movieId": "movie-dune", "choice": "like" } }`
- Server messages:
  - `room.snapshot` - full room state after joins/swipes/connect changes
  - `room.match_found` - emitted when likes hit the room threshold
  - `room.error` - validation/session errors

### Notes

- Rooms currently use demo movie cards, not TMDB yet.
- State resets when server restarts.
- Auth is optional for rooms; logged-in users can still create/join.

### Web Routes

- `/rooms` - create room or join by room code
- `/rooms/:roomCode` - live room page with swipe controls + member presence

## Movies API (Provider-backed)

Public routes (no auth required):

- `GET /api/movies/popular?page=1`
- `GET /api/movies/search?q=batman&page=1`
- `GET /api/movies/:movieId`

Provider behavior:

- If `TMDB_API_KEY` is set, server uses TMDB.
- If TMDB is not configured (or fails), server falls back to an in-memory mock catalog.
- You can force mock mode with `MOVIE_PROVIDER=mock`.

## Devcontainer Notes

- Postgres runs on port `5432`.
- Redis is available via the optional compose profile:

```
COMPOSE_PROFILES=redis
```

## Scripts

- `bun run dev` - run all dev servers
- `bun run dev:server` - server only
- `bun run dev:web` - web only
- `bun run db:generate` - Drizzle generate
- `bun run db:migrate` - Drizzle migrate
- `bun run db:studio` - Drizzle studio
