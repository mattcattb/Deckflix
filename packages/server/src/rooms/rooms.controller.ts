import {zValidator} from "@hono/zod-validator";
import {getBunServer, upgradeWebSocket} from "hono/bun";
import {
  decodeDisplayClientMessage,
  decodePlayerClientMessage,
  encodeDisplayServerMessage,
  encodePlayerServerMessage,
  joinGamePayloadSchema,
  voteGamePayloadSchema,
} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import {ensureSocketPubSub} from "../lib/redis";
import {
  clearRoomSessionCookie,
  displaySessionMiddleware,
  playerSessionMiddleware,
  readRoomSessionCookie,
  roomMiddleware,
  setRoomSessionCookie,
} from "./rooms.middleware";
import * as RoomsService from "./rooms.service";

const playerRoutes = createRouter()
  .get("/me", playerSessionMiddleware, async (c) => {
    return c.json(await RoomsService.getPlayerState(c.get("playerSession")));
  })
  .get(
    "/ws",
    playerSessionMiddleware,
    upgradeWebSocket((c) => {
      const {gameCode} = c.get("roomRequest");
      const {playerId, sessionToken} = c.get("playerSession");
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);

      return {
        onOpen: (_, ws) => {
          void RoomsService.openPlayerConnection({
            gameCode,
            playerId,
            sessionToken,
            socket: ws,
          })
            .then(async () => {
              ws.send(encodePlayerServerMessage({
                type: "player.snapshot",
                payload: await RoomsService.getPlayerState({gameCode, playerId}),
              }));
              RoomsService.publishState(server, gameCode);
              RoomsService.subscribePlayer(ws, gameCode, playerId);
            })
            .catch(() => {
              ws.close(4001, "Invalid player session");
            });
        },
        onClose: (_, ws) => {
          RoomsService.unsubscribePlayer(ws, gameCode, playerId);
          RoomsService.closePlayerConnection({
            gameCode,
            playerId,
            socket: ws,
          });
          RoomsService.publishState(server, gameCode);
        },
        onMessage: (event, ws) => {
          try {
            const parsed = decodePlayerClientMessage(event.data as string);
            if (parsed.type === "ping") {
              ws.send(encodePlayerServerMessage({type: "pong"}));
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid websocket message";
            ws.send(encodePlayerServerMessage({
              type: "player.error",
              payload: {message},
            }));
          }
        },
      };
    }),
  )
  .post("/", zValidator("json", joinGamePayloadSchema), async (c) => {
    const {gameCode} = c.get("roomRequest");
    const input = c.req.valid("json");
    const session = readRoomSessionCookie(c);
    await RoomsService.ensureRoomSessionAvailable(session);
    if (session) {
      clearRoomSessionCookie(c);
    }

    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    const result = await RoomsService.join({
      gameCode,
      displayName: input.displayName,
      server,
    });

    setRoomSessionCookie(c, {
      gameCode: result.gameCode,
      role: "player",
      roleId: result.playerSession.playerId,
      sessionToken: result.playerSession.sessionToken,
    });

    return c.json({
      gameCode: result.gameCode,
      playerSession: result.playerSession,
    }, 201);
  })
  .post(
    "/:playerId/votes",
    playerSessionMiddleware,
    zValidator("json", voteGamePayloadSchema),
    async (c) => {
      const input = c.req.valid("json");
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);
      const result = await RoomsService.vote({
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
    await RoomsService.leave({
      player: c.get("playerSession"),
      server,
    });
    clearRoomSessionCookie(c);
    return c.body(null, 204);
  });

const displayRoutes = createRouter()
  .get("/state", displaySessionMiddleware, async (c) => {
    return c.json(await RoomsService.getDisplayState(c.get("roomRequest").gameCode));
  })
  .get(
    "/ws",
    displaySessionMiddleware,
    upgradeWebSocket((c) => {
      const {gameCode} = c.get("roomRequest");
      const {displayId, sessionToken} = c.get("displaySession");
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);

      return {
        onOpen: (_, ws) => {
          void RoomsService.openDisplayConnection({
            gameCode,
            displayId,
            sessionToken,
            socket: ws,
          })
            .then(async () => {
              ws.send(encodeDisplayServerMessage({
                type: "display.snapshot",
                payload: await RoomsService.getDisplayState(gameCode),
              }));
              RoomsService.publishState(server, gameCode);
              RoomsService.subscribeDisplay(ws, gameCode);
            })
            .catch(() => {
              ws.close(4001, "Invalid display session");
            });
        },
        onClose: (_, ws) => {
          RoomsService.unsubscribeDisplay(ws, gameCode);
          RoomsService.closeDisplayConnection({
            gameCode,
            socket: ws,
          });
          RoomsService.publishState(server, gameCode);
        },
        onMessage: (event, ws) => {
          try {
            const parsed = decodeDisplayClientMessage(event.data as string);
            if (parsed.type === "ping") {
              ws.send(encodeDisplayServerMessage({type: "pong"}));
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : "Invalid websocket message";
            ws.send(encodeDisplayServerMessage({
              type: "display.error",
              payload: {message},
            }));
          }
        },
      };
    }),
  );

export const roomsController = createRouter()
  .get("/session", async (c) => {
    const session = readRoomSessionCookie(c);
    const activeClient = await RoomsService.getActiveClient(session);
    if (session && activeClient.role === "none") {
      clearRoomSessionCookie(c);
    }
    return c.json(activeClient);
  })
  .use("/:gameCode/*", roomMiddleware)
  .get("/:gameCode/client", async (c) => {
    const {gameCode, session} = c.get("roomRequest");
    const client = await RoomsService.getClient({gameCode, session});
    if (session && client.role === "none") {
      clearRoomSessionCookie(c);
    }
    return c.json(client);
  })
  .get("/:gameCode/meta", async (c) => {
    return c.json(await RoomsService.getMeta(c.get("roomRequest").gameCode));
  })
  .get("/:gameCode/players", async (c) => {
    return c.json(await RoomsService.getPlayers(c.get("roomRequest").gameCode));
  })
  .get("/:gameCode/results", async (c) => {
    return c.json(await RoomsService.getResults(c.get("roomRequest").gameCode));
  })
  .route("/:gameCode/display", displayRoutes)
  .route("/:gameCode/players", playerRoutes)
  .delete("/:gameCode", displaySessionMiddleware, async (c) => {
    await RoomsService.remove(c.get("displaySession"));
    clearRoomSessionCookie(c);
    return c.body(null, 204);
  });
