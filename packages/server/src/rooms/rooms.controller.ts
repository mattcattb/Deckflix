import {zValidator} from "@hono/zod-validator";
import {getBunServer} from "hono/bun";
import {
  createGamePayloadSchema,
  joinGamePayloadSchema,
  joinRoomPayloadSchema,
} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import {ensureSocketPubSub} from "../lib/redis";
import {
  clearRoomSessionCookie,
  requireGameLobby,
  readRoomSessionCookie,
  roomMiddleware,
  setRoomSessionCookie,
} from "./rooms.middleware";
import * as RoomsService from "./rooms.service";

export const roomsController = createRouter()
  .get("/session", async (c) => {
    const session = readRoomSessionCookie(c);
    const activeClient = await RoomsService.getActiveClient(session);
    if (session && activeClient.role === "none") {
      clearRoomSessionCookie(c);
    }
    return c.json(activeClient);
  })
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
  .post("/join", zValidator("json", joinRoomPayloadSchema), async (c) => {
    const input = c.req.valid("json");
    const session = readRoomSessionCookie(c);
    await RoomsService.ensureRoomSessionAvailable(session);
    if (session) {
      clearRoomSessionCookie(c);
    }

    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    const result = await RoomsService.join({
      gameCode: input.gameCode,
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
  .use("/:gameCode/*", roomMiddleware)
  .get("/:gameCode/meta", async (c) => {
    return c.json(await RoomsService.getMeta(c.get("roomRequest").gameCode));
  })
  .get("/:gameCode/players", async (c) => {
    return c.json(await RoomsService.getPlayers(c.get("roomRequest").gameCode));
  })
  .post("/:gameCode/players", requireGameLobby, zValidator("json", joinGamePayloadSchema), async (c) => {
    const session = readRoomSessionCookie(c);
    await RoomsService.ensureRoomSessionAvailable(session);
    if (session) {
      clearRoomSessionCookie(c);
    }

    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    const result = await RoomsService.join({
      gameCode: c.get("roomRequest").gameCode,
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
  });
