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
import * as RoomsService from "./rooms.service";

export const roomController = createRouter()
  .post("/", zValidator("json", createGamePayloadSchema), async (c) => {
    const session = readRoomSessionCookie(c);
    await RoomsService.ensureRoomSessionAvailable(session);
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
    const activeClient = await RoomsService.getActiveClient(session);
    if (session && activeClient.role === "none") {
      clearRoomSessionCookie(c);
    }
    return c.json(activeClient);
  })
  .delete("/current", async (c) => {
    clearRoomSessionCookie(c);
    return c.body(null, 204);
  })
  .use("/:gameCode/*", gameParamMiddleware)
  .get("/:gameCode/meta", async (c) => {
    return c.json(await RoomsService.getMeta(c.get("room").gameCode));
  })
  .get("/:gameCode/players", async (c) => {
    return c.json(await RoomsService.getPlayers(c.get("room").gameCode));
  })
  .post(
    "/:gameCode/join",
    requireGameLobby,
    zValidator("json", joinGamePayloadSchema),
    async (c) => {
      const session = readRoomSessionCookie(c);
      await RoomsService.ensureRoomSessionAvailable(session);
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
  )
  .get("/meta", activeRoomMiddleware, async (c) => {
    return c.json(await RoomsService.getMeta(c.get("room").gameCode));
  })
  .get("/players", activeRoomMiddleware, async (c) => {
    return c.json(await RoomsService.getPlayers(c.get("room").gameCode));
  })
  .get("/results", activeRoomMiddleware, async (c) => {
    return c.json(await RoomsService.getResults(c.get("room").gameCode));
  });
