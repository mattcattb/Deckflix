import {zValidator} from "@hono/zod-validator";
import {getBunServer} from "hono/bun";
import {
  createGamePayloadSchema,
  joinGamePayloadSchema,
} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import {ensureSocketPubSub} from "../lib/redis";
import {
  activeRoomMiddleware,
  clearRoomSessionCookie,
  gameParamMiddleware,
  readRoomSessionCookie,
  requireGameLobby,
  setRoomSessionCookie,
} from "./rooms.middleware";
import * as GameSnapshotService from "../games/game-snapshot.service";
import * as RoomSessionService from "./room-session.service";
import * as RoomsService from "./rooms.service";

export const roomController = createRouter()
  .post("/", zValidator("json", createGamePayloadSchema), async (c) => {
    const session = readRoomSessionCookie(c);
    await RoomSessionService.assertRoomSessionAvailable(session);
    if (session) {
      clearRoomSessionCookie(c);
    }

    const input = c.req.valid("json");
    const result = await RoomsService.create({
      roomName: input.roomName,
      settings: input.settings,
    });

    setRoomSessionCookie(c, {
      gameCode: result.gameCode,
      role: "display",
      roleId: result.displaySession.displayId,
      sessionToken: result.displaySession.sessionToken,
    });

    return c.json(result, 201);
  })
  .get("/current", async (c) => {
    const session = readRoomSessionCookie(c);
    const activeClient = await RoomSessionService.getActiveRoomClient(session);
    if (session && activeClient.role === "none") {
      clearRoomSessionCookie(c);
    }
    return c.json(activeClient);
  })
  .delete("/current", async (c) => {
    clearRoomSessionCookie(c);
    return c.body(null, 204);
  })
  .get("/meta", activeRoomMiddleware, async (c) => {
    return c.json(await GameSnapshotService.getGameMeta(c.get("room").gameCode));
  })
  .get("/players", activeRoomMiddleware, async (c) => {
    return c.json(await GameSnapshotService.getGamePlayers(c.get("room").gameCode));
  })
  .get("/results", activeRoomMiddleware, async (c) => {
    return c.json(await GameSnapshotService.getGameResults(c.get("room").gameCode));
  })
  .use("/:gameCode/*", gameParamMiddleware)
  .get("/:gameCode/meta", async (c) => {
    return c.json(await GameSnapshotService.getGameMeta(c.get("room").gameCode));
  })
  .get("/:gameCode/players", async (c) => {
    return c.json(await GameSnapshotService.getGamePlayers(c.get("room").gameCode));
  })
  .post(
    "/:gameCode/join",
    requireGameLobby,
    zValidator("json", joinGamePayloadSchema),
    async (c) => {
      const session = readRoomSessionCookie(c);
      await RoomSessionService.assertRoomSessionAvailable(session);
      if (session) {
        clearRoomSessionCookie(c);
      }

      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);
      const result = await RoomsService.join({
        gameCode: c.get("room").gameCode,
        displayName: c.req.valid("json").displayName,
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
    },
  );
