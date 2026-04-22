# Deckflix

Deckflix is a Jackbox-style movie picker:

- the `display` creates and presents a game
- `players` join from their own devices with a game code
- anonymous room cookies store the per-room display/player identity token

## Core Features

1. Players join a game with a game code
2. Game settings control the movie queue
3. Player controller view supports like, dislike, maybe, super like, and skip
4. Card View for movies (description, image, score, etc)
5. Rudamentary Recomendation system for users (maybe an account or lettrbox integration idk)
6. Streaming service locations for movies perhaps

## Some Features

1. Games for joining and setting preferences (preferred genres, star limits, etc)
2. Swiping features, with selection algorithms and prefence matching
3. Integration with a movie db api for getting movies to show
4. The display view shows live results, matches, and rejected titles
5. swiping options for like, dislike, maybe, and skip
6. Maybe some config settings like how many people need to like it or not (later features )

- Add info view (like for tinder) to show movie description + other information on it
- click on movies in home view to pull up modal for the movie information
- toast notifications on matches!
- better display view for matches
- settings, movie stars filtering
- genre filtering for movies recommedended
- filter in settings movie recency
- back option
- show genre in next swipe details (defered loading)
- like, superlike, dislike animations?
- match event on user device + profile device? (if a move is selected by everyone do a event OR )
- on response to a matched movie show the match animation

- settings in room creation page

- rejected bug...
- double linked list for preserving back? (or do this on client idk)
- swipe maybe should have an id?

## Quick Start

1. Copy envs:

```
cp .env.example .env
cp packages/server/.env.example packages/server/.env
```

2. Start Postgres and Redis:

```
docker compose up -d
```

If `DATABASE_URL` or `REDIS_URL` are unset, the server defaults to:

```
DATABASE_URL=postgresql://postgres:postgres@localhost:15432/postgres
REDIS_URL=redis://localhost:16380
PORT=3100
VITE_API_URL=http://localhost:3100
VITE_PORT=4173
```

3. Install dependencies:

```
bun install
```

4. Start dev servers:

```
bun run dev
```

The server runs on `http://localhost:3100` and the web app on `http://localhost:4173`.

If another project is already using those ports too, override them in `.env` before
you start anything:

```
POSTGRES_PORT=25432
REDIS_PORT=26380
DATABASE_URL=postgresql://postgres:postgres@localhost:25432/postgres
REDIS_URL=redis://localhost:26380
PORT=3200
VITE_API_URL=http://localhost:3200
VITE_PORT=4273
BETTER_AUTH_URL=http://localhost:4273
CORS_ORIGINS=http://localhost:4273
```

## Auth Routes

Better Auth is still available at `/api/auth`, but movie games are anonymous-first for MVP.

## Example API (Projects)

Authenticated routes (require session cookie):

- `GET /api/projects` - list projects
- `POST /api/projects` - create project `{ "name": "My Project" }`

## Movie Games (Core MVP)

Movie games are anonymous-first for MVP. A browser keeps either a display-local
session or a player-local session so it can reconnect without creating an account.

### Game REST API

- `POST /api/games` - create a new display-owned game
- `GET /api/games/:gameCode/display` - fetch the display snapshot for the owning display session
- `GET /api/games/:gameCode/session` - resolve the current browser role for the room from the room cookie
- `GET /api/games/:gameCode/join` - fetch join-safe public game info
- `GET /api/games/:gameCode/players/me` - fetch the current player snapshot from the player cookie
- `POST /api/games/:gameCode/players` - join as a player
- `POST /api/games/:gameCode/players/:playerId/votes` - record a vote for the current player
- `POST /api/games/:gameCode/players/:playerId/leave` - leave the game as the current player

### Game WebSockets

- `GET /api/games/:gameCode/display/ws`
- `GET /api/games/:gameCode/players/ws`
- Display messages:
  - `display.snapshot`
  - `display.player_joined`
  - `display.match_found`
  - `display.error`
- Player messages:
  - `player.snapshot`
  - `player.vote_recorded`
  - `player.match_found`
  - `player.error`

### Notes

- Game state is stored in Redis.
- The display is never treated as a player.
- Better Auth remains in the repo for later account-based features, but games do not require accounts.

### Web Routes

- `/` - main entry with a display/play mode toggle
- `/room/:gameCode` - unified room route that renders display, player, or join-needed

## Movies API (Provider-backed)

Public routes (no auth required):

- `GET /api/movies/popular?page=1`
- `GET /api/movies/search?q=batman&page=1`
- `GET /api/movies/:movieId`

Provider behavior:

- If `TMDB_API_KEY` is set, server uses TMDB.
- If TMDB is not configured (or fails), server falls back to an in-memory mock catalog.
- You can force mock mode with `MOVIE_PROVIDER=mock`.

## Scripts

- `bun run dev` - run all dev servers
- `bun run dev:server` - server only
- `bun run dev:web` - web only
- `bun run db:generate` - Drizzle generate
- `bun run db:migrate` - Drizzle migrate
- `bun run db:studio` - Drizzle studio
