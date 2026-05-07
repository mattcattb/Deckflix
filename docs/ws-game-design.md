# Deckflix WebSocket Game Design

This note describes the shape this app should move toward: small controllers, plain services, typed messages, Redis-backed room state, and WebSockets used only for live updates.

## Design Goals

- Keep HTTP and WebSocket controllers thin.
- Put Redis reads/writes in services.
- Put game rules in gameplay services.
- Keep shared message schemas in `packages/shared`.
- Treat cookies as client session pointers, not game state.
- Treat Redis as the source of truth for active rooms.
- Publish snapshots after state changes instead of making clients infer too much.

## Current Mental Model

Deckflix has two client roles:

- `display`: owns the room, configures settings, starts/ends the game, sees the whole room state.
- `player`: joins a room, receives their own swipe state, submits votes, can leave.

The server has these broad layers:

- Controllers: HTTP routes and WebSocket lifecycle handlers.
- Middleware: reads cookies, verifies room/session role, loads room context.
- Services: own Redis operations and game logic.
- Shared package: owns schemas, event names, DTOs, and client/server message contracts.

## Recommended File Boundaries

Controllers should do only this:

- Validate request input.
- Read actor context from middleware.
- Call one service function.
- Return HTTP response or send WebSocket messages.

Services should own decisions:

- `rooms.service.ts`: create room, join room, leave room, start/end room, verify sessions.
- `presence.service.ts`: track connected sockets and publish presence changes.
- `realtime.service.ts`: topic names, subscribe/unsubscribe, publish encoded messages.
- `game-state.service.ts`: build display/player snapshots.
- `swipe.service.ts`: record votes and advance player deck.
- `deck.service.ts`: per-player queue/index state.
- `recommendations.service.ts`: movie pool generation and movie metadata.
- `game-settings.service.ts`: default, merge, validate, and store settings.

Avoid service-to-service tangles where possible. A good rule: one public service function should represent one user action.

## Room Lifecycle Requirements

### Create Room

When the display creates a room:

- Generate a unique 4-character game code.
- Generate a `displayId` and `sessionToken`.
- Store room metadata in Redis.
- Store default or submitted settings in Redis.
- Set an HTTP-only room session cookie for the display.
- Return the game code and display session.

Redis source of truth:

- `game:{CODE}:room`
  - `meta`: id, code, roomName, createdAt
  - `status`: lobby/swiping/completed, endedAt
  - `display`: displayId, sessionToken
  - `poolSeed`: recommendation seed

### Join Room

When a player joins:

- Require the room to exist.
- Require the room status to be `lobby`.
- Reject the request if the browser already has a valid active room cookie.
- Generate a `playerId` and `sessionToken`.
- Store player record in Redis.
- Set an HTTP-only room session cookie for the player.
- Publish `presence.player_joined` to the display.
- Publish fresh display/player snapshots.

Redis source of truth:

- `game:{CODE}:players`
  - hash field: `playerId`
  - value: displayName, joinedAt, sessionToken

### Start Game

When the display starts:

- Require display session.
- Require `lobby` status.
- Require at least 2 players.
- Generate or load the movie pool.
- Initialize each player's deck.
- Change room status to `swiping`.
- Publish `room.status_changed`.
- Publish fresh display/player snapshots.

### Player Vote

When a player votes:

- Require player session.
- Require `swiping` status.
- Verify the movie is the player's current movie.
- Store the vote.
- Advance the player's deck.
- Recalculate match/rejection state.
- Publish fresh snapshots.

The client may optimistically animate a swipe, but Redis and the service result are authoritative.

### Leave Room

When a player leaves:

- Verify player session.
- Remove player record.
- Clear their deck/vote state if that is the intended product behavior.
- Publish `presence.player_left`.
- Publish fresh snapshots.
- Clear the player's room cookie.

Decide product behavior explicitly:

- Hard leave: delete the player from the game.
- Soft disconnect: keep the player joined but mark them offline.

Right now the app is closer to hard leave for `/api/player/leave` and soft disconnect for WebSocket close.

### End Room

When the display ends:

- Verify display session.
- Set status to `completed`.
- Publish `room.status_changed`.
- Publish `room.deleted` or `room.ended`.
- Delete room Redis keys.
- Clear in-memory presence.
- Clear display cookie.

Prefer `room.ended` if clients should show final results. Use `room.deleted` only when the room truly no longer exists.

## Cookie Requirements

Cookie name:

- `deckflix_active_game`

Cookie value shape:

```txt
{gameCode}.{role}.{roleId}.{sessionToken}
```

Cookie rules:

- HTTP-only.
- Path scoped to `/api`.
- `SameSite=Lax` in local development.
- `SameSite=None; Secure` in production/HTTPS.
- Cookie stores only session identity.
- Redis verifies whether the cookie is still valid.
- Invalid cookies should be cleared.

Session validation:

- Display cookie is valid only if `displayId` and `sessionToken` match room metadata.
- Player cookie is valid only if `playerId` exists and `sessionToken` matches the player record.

## Presence Requirements

Presence answers a different question than joining.

- Joined: player has a Redis player record.
- Connected: player has at least one active WebSocket connection.
- Disconnected: player is still joined, but has zero active sockets.
- Left: player record was intentionally removed.

In-memory presence is fine for one Bun process:

- `displaySocketsByGameCode: Map<gameCode, Set<socket>>`
- `playerSocketsByGameCode: Map<gameCode, Map<playerId, Set<socket>>>`

For multiple server processes, move presence into Redis with TTL heartbeats:

- `game:{CODE}:presence:display`
- `game:{CODE}:presence:players`
- socket heartbeat TTL around 20-45 seconds

Do not delete a player just because their WebSocket closed. Browser refreshes, mobile sleep, and network changes will all close sockets.

## WebSocket Requirements

WebSockets should not be the write API at first. Keep writes as HTTP while the game is simple.

Good first version:

- HTTP creates rooms, joins rooms, starts games, records votes, leaves rooms.
- WebSocket sends snapshots, pings, errors, and server events.

Client to server messages:

- `socket.ping`

Server to display messages:

- `socket.pong`
- `socket.error`
- `display.snapshot`
- `presence.player_joined`
- `presence.player_left`
- `room.status_changed`
- `room.started`
- `room.ended`

Server to player messages:

- `socket.pong`
- `socket.error`
- `player.snapshot`
- `room.status_changed`
- `room.ended`

Add client-to-server WebSocket mutations only when there is a real need for lower latency. When you do, route them through the same services used by HTTP.

## Realtime Topic Requirements

Topic names should be boring and centralized:

```ts
const TOPICS = {
  display: (gameCode: string) => `ws:display:${gameCode}`,
  player: (gameCode: string, playerId: string) => `ws:player:${gameCode}:${playerId}`,
  room: (gameCode: string) => `ws:room:${gameCode}`,
};
```

Use topics like this:

- Display socket subscribes to `display` and optionally `room`.
- Player socket subscribes to its `player` topic and optionally `room`.
- Broadcast room-wide events to `room`.
- Send private player state to `player`.
- Send full display state to `display`.

## Redis Requirements

Use Redis for active game state:

- Room metadata.
- Player records.
- Settings.
- Movie pool.
- Per-player deck.
- Votes and match state.

Use TTLs:

- Active room keys should expire after a reasonable period, currently 24 hours.
- Every write should refresh the TTL for related keys.
- If room keys expire, cookies become invalid automatically because validation fails.

Use locks for multi-key room mutations:

- join
- leave
- start
- end
- vote if it touches shared match state

Lock scope should be `game:{CODE}:lock`.

## Snapshot Requirements

Prefer server-generated snapshots:

- `DisplayGameState`: summary, settings, queue, player progress, results.
- `PlayerGameState`: summary, settings, me, current item, remaining count.

After any state-changing action, publish snapshots to affected clients.

This costs more Redis reads but keeps the client simple and avoids event ordering bugs.

Optimize later with smaller patch events only when snapshots become a measured problem.

## Error Requirements

Use consistent failures:

- `400`: bad request or impossible action.
- `401`: invalid session/token inside service boundaries.
- `404`: hide rooms/sessions from the client when the active cookie is invalid.
- `409`: valid request at the wrong time, such as joining after start.

For WebSockets:

- Close with `4001` for invalid session.
- Send `socket.error` for malformed messages.
- Keep unexpected server errors out of client payloads.

## Work Plan For Refactoring

1. Fix `realtime.service.ts` so topic helpers are complete and there are no placeholder symbols.
2. Keep one display WebSocket handler and one player WebSocket handler.
3. Make all topic names come from `realtime.service.ts`.
4. Keep Redis key names inside the service that owns that data.
5. Move publish helpers out of `rooms.service.ts` if they are not room-state decisions.
6. Decide hard leave vs soft disconnect and encode that in service names.
7. Add tests at the service layer before changing controller behavior.

## Naming Rules

Use names that say what state they touch:

- `joinRoom`
- `leaveRoom`
- `verifyRoomSession`
- `connectPlayerSocket`
- `disconnectPlayerSocket`
- `publishRoomSnapshot`
- `recordPlayerVote`
- `initializePlayerDecks`

Avoid vague names:

- `handle`
- `process`
- `sync`
- `manager`
- `meta` when the type can be more specific

## Practical Build Order

Build this in slices:

1. Room/session/cookie correctness.
2. Join and lobby presence.
3. Display/player WebSocket snapshots.
4. Start game.
5. Player vote flow.
6. Match/results logic.
7. End room cleanup.
8. Multi-server Redis pub/sub and Redis-backed presence if needed.

Do not start with generalized event infrastructure. Start with explicit service functions and typed messages.

## Event Layering

Domain events should describe what happened, not who should receive it.

Good event names:

- `player.joined`
- `player.left`
- `player.connected`
- `player.disconnected`
- `room.started`
- `room.ended`
- `swipe.recorded`
- `match.found`
- `snapshot.changed`

Avoid transport-shaped event names:

- `display.player_joined`
- `player.room_started`
- `send_to_display`
- `broadcast_to_players`

The clean layering is:

1. Domain service mutates state.
2. Domain service emits a domain event.
3. Local event bus lets in-process listeners react.
4. Redis pub/sub forwards events across server processes.
5. WebSocket fanout publishes the event to a room topic.
6. Clients decide whether the event matters to their current screen.

For now, most game events can go to everyone in the room. This keeps routing simple and keeps the event model honest.

## Recommended Event Pipeline

Use one internal envelope for server-side events:

```ts
type GameEventEnvelope<TType extends string = string, TPayload = unknown> = {
  id: string;
  gameCode: string;
  type: TType;
  payload: TPayload;
  createdAt: string;
};
```

Service code should publish events like this:

```ts
await GameEvents.publish({
  gameCode,
  type: "player.joined",
  payload: {playerId, displayName, joinedAt},
});
```

The service should not call `server.publish`, should not know WebSocket topic names, and should not know whether display or player clients exist.

## Layer Responsibilities

### Domain Services

Examples:

- `RoomsService.join`
- `RoomsService.leavePlayer`
- `SwipeService.recordSwipe`
- `RoomsService.start`

Responsibilities:

- Validate the action.
- Take the room lock if needed.
- Read/write Redis state.
- Return useful service results.
- Emit domain events after successful state changes.

They should not:

- Subscribe sockets.
- Encode WebSocket payloads.
- Pick display vs player recipients.
- Know Redis pub/sub channels.

### Local Event Bus

Purpose:

- Decouple services from side effects.
- Let multiple listeners react to the same event.
- Keep single-process behavior simple.

Example listeners:

- `snapshot.listener.ts`: publishes fresh snapshots after state-changing events.
- `realtime.listener.ts`: forwards public domain events to WebSocket fanout.
- `logging.listener.ts`: logs important game actions.

Use Node's `EventEmitter` or a tiny typed wrapper. Do not overbuild this at first.

### Redis Pub/Sub

Purpose:

- Forward events between Bun/server processes.
- Make a mutation on process A visible to sockets connected to process B.

There are two reasonable designs:

- Publish domain events to Redis, then every process runs the same listeners.
- Run local listeners first, then publish only final WebSocket fanout messages to Redis.

Prefer publishing domain events to Redis if you want one consistent event model. Prefer publishing final fanout messages if you want the smallest change from the current code.

For this app, the clean target is:

```txt
service -> local event bus -> Redis domain event channel -> local listeners -> WebSocket room topic
```

### WebSocket Fanout

Purpose:

- Manage socket subscriptions.
- Publish encoded messages to Bun topics.
- Bridge those messages across Redis when multiple processes exist.

It should understand:

- room topic names
- socket subscribe/unsubscribe
- encoding public client events

It should not understand:

- game rules
- Redis room key shapes
- match calculations
- cookie/session validation

## Room-Wide Events First

The simplest useful rule:

- Every connected socket for a game subscribes to `ws:room:{CODE}`.
- Most events publish to `ws:room:{CODE}`.
- Display and player clients parse the same server event union.
- Each client ignores events it does not care about.

Private player snapshots can stay on `ws:player:{CODE}:{PLAYER_ID}` because they contain player-specific state.

Recommended topics:

```ts
const TOPICS = {
  room: (gameCode: string) => `ws:room:${gameCode}`,
  player: (gameCode: string, playerId: string) =>
    `ws:player:${gameCode}:${playerId}`,
};
```

Display socket:

- subscribes to `room`

Player socket:

- subscribes to `room`
- subscribes to its private `player` topic

This removes the need for most `display` vs `player` routing.

## Public Client Message Shape

Move toward one shared server message union:

```ts
type ServerMessage =
  | {type: "socket.pong"}
  | {type: "socket.error"; payload: {message: string}}
  | {type: "player.joined"; payload: PlayerPresence}
  | {type: "player.left"; payload: {playerId: string}}
  | {type: "room.started"}
  | {type: "room.status_changed"; payload: StatusChange}
  | {type: "swipe.recorded"; payload: VoteSummary}
  | {type: "match.found"; payload: MatchSummary}
  | {type: "snapshot.display"; payload: DisplayGameState}
  | {type: "snapshot.player"; payload: PlayerGameState};
```

Then split only when privacy requires it:

- Room-wide messages can go to everyone.
- Player snapshots go only to that player.
- Display-only snapshots may be removed if display can derive enough from room-wide state, but keeping a display snapshot is fine.

## Event Naming

Use past-tense facts:

- `player.joined`
- `player.left`
- `room.started`
- `room.ended`
- `swipe.recorded`
- `match.found`

Use commands only for inbound client intent:

- `room.start_requested`
- `swipe.submit_requested`

For this app, HTTP handles most commands, so WebSocket client messages can remain tiny:

- `socket.ping`

## Snapshot Listener

Snapshots are derived state, so they fit well as event listeners.

Example:

```txt
player.joined -> publish room event -> publish display snapshot
swipe.recorded -> publish room event -> publish player snapshot -> publish display snapshot
match.found -> publish room event -> publish display snapshot
```

This keeps services focused on writes. It also makes it obvious which side effects happen after each domain event.

## Practical Refactor Target

Minimal set of files:

- `events/game-events.ts`: typed local event bus and `publish`.
- `events/game-event-schemas.ts`: shared internal event schemas if needed.
- `events/listeners/realtime.listener.ts`: maps domain events to room-wide WebSocket messages.
- `events/listeners/snapshot.listener.ts`: publishes display/player snapshots.
- `realtime/realtime.service.ts`: topics, socket subscribe/unsubscribe, publish encoded socket messages.
- `redis/redis-event-bus.ts`: optional cross-process domain event bridge.

First milestone:

- One `ServerMessage` schema in shared.
- One `publishRoomMessage(gameCode, message)` function.
- One `publishPlayerMessage(gameCode, playerId, message)` function.
- Services emit events instead of directly publishing display/player messages.

This is enough structure without creating a large framework.
