import {zValidator} from "@hono/zod-validator";
import {getBunServer, upgradeWebSocket} from "hono/bun";
import {
  createGamePayloadSchema,
  decodeDisplayClientMessage,
  decodePlayerClientMessage,
  encodeDisplayServerMessage,
  encodePlayerServerMessage,
  joinGamePayloadSchema,
  voteGamePayloadSchema,
} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import {ensureSocketPubSub} from "../lib/redis";
import * as GamesService from "./games.service";
import {
  clearRoomSessionCookie,
  displaySessionMiddleware,
  playerSessionMiddleware,
  readRoomSessionCookie,
  roomMiddleware,
  setRoomSessionCookie,
} from "./games.middleware";
import {
  publishDisplayMessage,
  publishPlayerMessage,
  subscribeToDisplay,
  subscribeToPlayer,
  unsubscribeFromDisplay,
  unsubscribeFromPlayer,
} from "../ws/topics";

const publishDisplaySnapshot = (server: Parameters<typeof ensureSocketPubSub>[0], gameCode: string) => {
  void GamesService.getDisplayGameSnapshot(gameCode)
    .then((snapshot) => {
      publishDisplayMessage(server, gameCode, {
        type: "display.snapshot",
        payload: snapshot,
      });
    })
    .catch(() => {});
};

const publishPlayerSnapshots = (
  server: Parameters<typeof ensureSocketPubSub>[0],
  gameCode: string,
) => {
  void GamesService.getGamePlayerIds(gameCode)
    .then((playerIds) =>
      Promise.all(
        playerIds.map(async (playerId) => {
          publishPlayerMessage(server, gameCode, playerId, {
            type: "player.snapshot",
            payload: await GamesService.getPlayerGameSnapshot({
              gameCode,
              playerId,
            }),
          });
        }),
      ),
    )
    .catch(() => {});
};

const playerController = createRouter()
  .get("/me", playerSessionMiddleware, async (c) => {
    const {gameCode} = c.get("roomRequest");
    const {playerId} = c.get("playerSession");

    return c.json(
      await GamesService.getPlayerGameSnapshot({
        gameCode,
        playerId,
      }),
    );
  })
  .post("/", zValidator("json", joinGamePayloadSchema), async (c) => {
    const {gameCode} = c.get("roomRequest");
    const input = c.req.valid("json");
    const session = readRoomSessionCookie(c);
    await GamesService.assertRoomSessionAvailable(session);
    if (session) {
      clearRoomSessionCookie(c);
    }
    const result = await GamesService.joinGame({
      gameCode,
      displayName: input.displayName,
    });

    setRoomSessionCookie(c, {
      gameCode: result.game.summary.code,
      role: "player",
      roleId: result.playerSession.playerId,
      sessionToken: result.playerSession.sessionToken,
    });

    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    publishDisplayMessage(server, result.game.summary.code, {
      type: "display.player_joined",
      payload: result.player,
    });
    publishDisplaySnapshot(server, result.game.summary.code);
    publishPlayerSnapshots(server, result.game.summary.code);

    return c.json({
      game: result.game,
      playerSession: result.playerSession,
    }, 201);
  })
  .post(
    "/:playerId/votes",
    playerSessionMiddleware,
    zValidator("json", voteGamePayloadSchema),
    async (c) => {
      const {gameCode} = c.get("roomRequest");
      const input = c.req.valid("json");
      const result = await GamesService.recordVote({
        player: c.get("playerSession"),
        movieId: input.movieId,
        choice: input.choice,
      });

      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);

      publishPlayerMessage(server, gameCode, result.game.me.playerId, {
        type: "player.vote_recorded",
        payload: {
          movieId: result.movieId,
          choice: result.choice,
        },
      });

      if (result.justMatched) {
        publishDisplayMessage(server, gameCode, {
          type: "display.match_found",
          payload: {movieId: result.movieId},
        });

        const playerIds = await GamesService.getGamePlayerIds(gameCode);
        for (const playerId of playerIds) {
          publishPlayerMessage(server, gameCode, playerId, {
            type: "player.match_found",
            payload: {movieId: result.movieId},
          });
        }
      }

      publishDisplaySnapshot(server, gameCode);
      publishPlayerSnapshots(server, gameCode);

      return c.json({game: result.game}, 201);
    },
  )
  .post("/:playerId/leave", playerSessionMiddleware, async (c) => {
    const {gameCode} = c.get("roomRequest");
    const {playerId} = c.get("playerSession");
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);

    await GamesService.leaveGame(c.get("playerSession"));
    clearRoomSessionCookie(c);

    publishDisplayMessage(server, gameCode, {
      type: "display.player_left",
      payload: {playerId},
    });
    publishDisplaySnapshot(server, gameCode);
    publishPlayerSnapshots(server, gameCode);

    return c.body(null, 204);
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
          void GamesService.connectPlayer({
            gameCode,
            playerId,
            sessionToken,
            socket: ws,
          })
            .then(async () => {
              ws.send(encodePlayerServerMessage({
                type: "player.snapshot",
                payload: await GamesService.getPlayerGameSnapshot({
                  gameCode,
                  playerId,
                }),
              }));
              publishDisplaySnapshot(server, gameCode);
              publishPlayerSnapshots(server, gameCode);
              subscribeToPlayer(ws, gameCode, playerId);
            })
            .catch(() => {
              ws.close(4001, "Invalid player session");
            });
        },
        onClose: (_, ws) => {
          unsubscribeFromPlayer(ws, gameCode, playerId);
          GamesService.disconnectPlayer({
            gameCode,
            playerId,
            socket: ws,
          });
          publishDisplaySnapshot(server, gameCode);
          publishPlayerSnapshots(server, gameCode);
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
  );

const roomController = createRouter()
  .use("*", roomMiddleware)
  .get("/join", async (c) => {
    return c.json(await GamesService.getPublicGameSnapshot(c.get("roomRequest").gameCode));
  })
  .get("/session", async (c) => {
    const {gameCode, session} = c.get("roomRequest");
    const snapshot = await GamesService.getRoomClientSnapshot({gameCode, session});
    if (session && snapshot.role === "none") {
      clearRoomSessionCookie(c);
    }
    return c.json(snapshot);
  })
  .get("/display", displaySessionMiddleware, async (c) => {
    return c.json(await GamesService.getDisplayGameSnapshot(c.get("roomRequest").gameCode));
  })
  .get(
    "/display/ws",
    displaySessionMiddleware,
    upgradeWebSocket((c) => {
      const {gameCode} = c.get("roomRequest");
      const {displayId, sessionToken} = c.get("displaySession");
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);

      return {
        onOpen: (_, ws) => {
          void GamesService.connectDisplay({
            gameCode,
            displayId,
            sessionToken,
            socket: ws,
          })
            .then(async () => {
              ws.send(encodeDisplayServerMessage({
                type: "display.snapshot",
                payload: await GamesService.getDisplayGameSnapshot(gameCode),
              }));
              publishDisplaySnapshot(server, gameCode);
              publishPlayerSnapshots(server, gameCode);
              subscribeToDisplay(ws, gameCode);
            })
            .catch(() => {
              ws.close(4001, "Invalid display session");
            });
        },
        onClose: (_, ws) => {
          unsubscribeFromDisplay(ws, gameCode);
          GamesService.disconnectDisplay({
            gameCode,
            socket: ws,
          });
          publishDisplaySnapshot(server, gameCode);
          publishPlayerSnapshots(server, gameCode);
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
  )
  .route("/players", playerController);

export const gamesController = createRouter()
  .post("/", zValidator("json", createGamePayloadSchema), async (c) => {
    const session = readRoomSessionCookie(c);
    await GamesService.assertRoomSessionAvailable(session);
    if (session) {
      clearRoomSessionCookie(c);
    }
    const input = c.req.valid("json");
    const result = await GamesService.createGame({
      roomName: input.roomName,
      settings: input.settings,
    });

    setRoomSessionCookie(c, {
      gameCode: result.game.summary.code,
      role: "display",
      roleId: result.displaySession.displayId,
      sessionToken: result.displaySession.sessionToken,
    });

    return c.json(result, 201);
  })
  .get("/session", async (c) => {
    const session = readRoomSessionCookie(c);
    const activeClient = await GamesService.getActiveRoomClient(session);
    if (session && activeClient.role === "none") {
      clearRoomSessionCookie(c);
    }
    return c.json(activeClient);
  })
  .route("/:gameCode", roomController)
  .delete("/:gameCode", roomMiddleware, displaySessionMiddleware, async (c) => {
    const {gameCode} = c.get("roomRequest");
    const {displayId, sessionToken} = c.get("displaySession");

    await GamesService.deleteGame({
      gameCode,
      displayId,
      sessionToken,
    });
    clearRoomSessionCookie(c);

    return c.body(null, 204);
  });
