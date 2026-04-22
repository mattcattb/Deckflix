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
  activePlayerSessionMiddleware,
  clearRoomSessionCookie,
  playerSessionMiddleware,
} from "../rooms/rooms.middleware";
import * as SwipeService from "./swipe.service";

const createPlayerSocketHandler = () =>
  upgradeWebSocket((c) => {
    const {gameCode} = c.get("roomRequest");
    const {playerId, sessionToken} = c.get("playerSession");
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);

    return {
      onOpen: (_, ws) => {
        void SwipeService.openSwipeConnection({
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
            SwipeService.subscribeSwipeSocket(ws, gameCode, playerId);
          })
          .catch(() => {
            ws.close(4001, "Invalid player session");
          });
      },
      onClose: (_, ws) => {
        SwipeService.unsubscribeSwipeSocket(ws, gameCode, playerId);
        SwipeService.closeSwipeConnection({
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

export const playerSwipeRoutes = createRouter()
  .get("/me", playerSessionMiddleware, async (c) => {
    return c.json(await SwipeService.getSwipeState(c.get("playerSession")));
  })
  .get("/ws", playerSessionMiddleware, createPlayerSocketHandler())
  .post(
    "/:playerId/votes",
    playerSessionMiddleware,
    zValidator("json", voteGamePayloadSchema),
    async (c) => {
      const input = c.req.valid("json");
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);
      const result = await SwipeService.recordSwipe({
        player: c.get("playerSession"),
        assignmentId: input.assignmentId,
        movieId: input.movieId,
        choice: input.choice,
        server,
      });

      return c.json({state: result.state}, 201);
    },
  )
  .post("/:playerId/leave", playerSessionMiddleware, async (c) => {
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    await SwipeService.leaveSwipe({
      player: c.get("playerSession"),
      server,
    });
    clearRoomSessionCookie(c);
    return c.body(null, 204);
  });

export const activeSwipeRoutes = createRouter()
  .get("/state", activePlayerSessionMiddleware, async (c) => {
    const {gameCode, playerId} = c.get("playerSession");
    const resp = await SwipeService.getSwipeState({gameCode, playerId});
    return c.json(resp);
  })
  .get("/ws", activePlayerSessionMiddleware, createPlayerSocketHandler())
  .post(
    "/votes",
    activePlayerSessionMiddleware,
    zValidator("json", voteGamePayloadSchema),
    async (c) => {
      // only swipe on the most recent one? or have to have the id for this too?
      const playerData = c.get("playerSession");
      const input = c.req.valid("json");
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);
      const result = await SwipeService.recordSwipe({
        player: playerData,
        assignmentId: input.assignmentId,
        movieId: input.movieId,
        choice: input.choice,
        server,
      });

      return c.json({state: result.state}, 201);
    },
  )
  .post("/leave", activePlayerSessionMiddleware, async (c) => {
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    await SwipeService.leaveSwipe({
      player: c.get("playerSession"),
      server,
    });
    clearRoomSessionCookie(c);
    return c.body(null, 204);
  });
