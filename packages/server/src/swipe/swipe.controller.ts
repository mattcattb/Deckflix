import {zValidator} from "@hono/zod-validator";
import {getBunServer, upgradeWebSocket} from "hono/bun";
import {
  decodePlayerClientMessage,
  encodePlayerServerMessage,
  voteGamePayloadSchema,
} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import {ensureSocketPubSub} from "../lib/redis";
import {
  activePlayerMiddleware,
  clearRoomSessionCookie,
  requireStartedGame,
} from "../rooms/rooms.middleware";
import * as SwipeService from "./swipe.service";
import * as GamePresenceService from "../ws/presence.ws";

const createPlayerSocketHandler = () =>
  upgradeWebSocket((c) => {
    const {gameCode} = c.get("room");
    const {playerId, sessionToken} = c.get("playerActor");
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);

    return {
      onOpen: (_, ws) => {
        void GamePresenceService.connectPlayer({
          gameCode,
          playerId,
          sessionToken,
          socket: ws,
        })
          .then(async () => {
            ws.send(
              encodePlayerServerMessage({
                type: "player.snapshot",
                payload: await SwipeService.getSwipeState({gameCode, playerId}),
              }),
            );
            SwipeService.publishState(server, gameCode);
            GamePresenceService.subscribePlayerSocket(ws, gameCode, playerId);
          })
          .catch(() => {
            ws.close(4001, "Invalid player session");
          });
      },
      onClose: (_, ws) => {
        GamePresenceService.unsubscribePlayerSocket(ws, gameCode, playerId);
        GamePresenceService.disconnectPlayer({
          gameCode,
          playerId,
          socket: ws,
        });
        SwipeService.publishState(server, gameCode);
      },
      onMessage: (event, ws) => {
        try {
          const parsed = decodePlayerClientMessage(event.data as string);
          if (parsed.type === "ping") {
            ws.send(encodePlayerServerMessage({type: "pong"}));
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Invalid websocket message";
          ws.send(
            encodePlayerServerMessage({
              type: "player.error",
              payload: {message},
            }),
          );
        }
      },
    };
  });

export const playerController = createRouter()
  .use("*", activePlayerMiddleware)
  .get("/", async (c) => {
    const {gameCode} = c.get("room");
    const {playerId} = c.get("playerActor");
    return c.json(await SwipeService.getSwipeState({gameCode, playerId}));
  })
  .get("/ws", createPlayerSocketHandler())
  .post(
    "/vote",
    requireStartedGame,
    zValidator("json", voteGamePayloadSchema),
    async (c) => {
      const input = c.req.valid("json");
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);
      const {gameCode} = c.get("room");
      const {playerId, sessionToken} = c.get("playerActor");
      const result = await SwipeService.recordSwipe({
        player: {
          gameCode,
          playerId,
          sessionToken,
        },
        assignmentId: input.assignmentId,
        movieId: input.movieId,
        choice: input.choice,
        server,
      });

      return c.json({state: result.state}, 201);
    },
  )
  .post("/leave", async (c) => {
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    const {gameCode} = c.get("room");
    const {playerId, sessionToken} = c.get("playerActor");
    await SwipeService.leaveSwipe({
      player: {
        gameCode,
        playerId,
        sessionToken,
      },
      server,
    });
    clearRoomSessionCookie(c);
    return c.body(null, 204);
  });
