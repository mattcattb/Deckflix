import {zValidator} from "@hono/zod-validator";
import {getBunServer} from "hono/bun";
import {
  createGamePayloadSchema,
  gameSettingsInputSchema,
  joinGamePayloadSchema,
} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import * as GameEventsService from "../realtime/game-events.service";
import {ensureSocketPubSub} from "../realtime/socket-pubsub.service";
import {
  activeRoomMiddleware,
  clearRoomSessionCookie,
  gameParamMiddleware,
  readRoomSessionCookie,
  requireDisplayActor,
  requireGameLobby,
  requirePlayerActor,
  setRoomSessionCookie,
} from "./rooms.middleware";
import * as GameStateService from "./game-state.service";
import * as RoomsService from "./rooms.service";
import * as RoomSettingsService from "./room-settings.service";

export const roomController = createRouter()
  .post("/", zValidator("json", createGamePayloadSchema), async (c) => {
    const session = readRoomSessionCookie(c);
    await RoomsService.assertRoomSessionAvailable(session);
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
    const activeClient = await RoomsService.getActiveRoomClient(session);
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
    return c.json(await GameStateService.getGameMeta(c.get("room").gameCode));
  })
  .get("/players", activeRoomMiddleware, async (c) => {
    return c.json(
      await GameStateService.getGamePlayers(c.get("room").gameCode),
    );
  })
  .get("/results", activeRoomMiddleware, async (c) => {
    return c.json(
      await GameStateService.getGameResults(c.get("room").gameCode),
    );
  })
  .get("/settings", activeRoomMiddleware, async (c) => {
    return c.json(
      await RoomSettingsService.getGameSettingsOrThrow(c.get("room").gameCode),
    );
  })
  .patch(
    "/settings",
    activeRoomMiddleware,
    requireDisplayActor,
    requireGameLobby,
    zValidator("json", gameSettingsInputSchema),
    async (c) => {
      const gameCode = c.get("room").gameCode;
      await RoomsService.updateSettings({
        gameCode,
        settings: c.req.valid("json"),
      });
      return c.json(await GameStateService.getGameMeta(gameCode));
    },
  )
  .post(
    "/start",
    activeRoomMiddleware,
    requireDisplayActor,
    requireGameLobby,
    async (c) => {
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);
      const result = await RoomsService.start({
        gameCode: c.get("room").gameCode,
      });
      GameEventsService.publishRoomStatusChanged(
        server,
        result.gameCode,
        result.playerIds,
        result.previousStatus,
        result.nextStatus,
      );
      GameEventsService.publishRoomStarted(server, result.gameCode);
      await GameEventsService.publishRoomSnapshot(
        server,
        result.gameCode,
        result.playerIds,
      );
      return c.body(null, 204);
    },
  )
  .post(
    "/end",
    activeRoomMiddleware,
    requireDisplayActor,
    async (c) => {
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);
      const result = await RoomsService.end({
        gameCode: c.get("room").gameCode,
      });
      GameEventsService.publishRoomStatusChanged(
        server,
        result.gameCode,
        result.playerIds,
        result.previousStatus,
        result.nextStatus,
      );
      GameEventsService.publishRoomDeleted(
        server,
        result.gameCode,
        result.playerIds,
      );
      clearRoomSessionCookie(c);
      return c.body(null, 204);
    },
  )
  .post(
    "/leave",
    activeRoomMiddleware,
    requirePlayerActor,
    async (c) => {
      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);
      const {gameCode} = c.get("room");
      const {playerId} = c.get("playerActor");
      const result = await RoomsService.removePlayer({
        gameCode,
        playerId,
      });
      GameEventsService.publishPlayerLeft(server, result.gameCode, playerId);
      await GameEventsService.publishRoomSnapshot(
        server,
        result.gameCode,
        result.playerIds,
      );
      clearRoomSessionCookie(c);
      return c.body(null, 204);
    },
  )
  .post(
    "/:gameCode/join",
    gameParamMiddleware,
    requireGameLobby,
    zValidator("json", joinGamePayloadSchema),
    async (c) => {
      const session = readRoomSessionCookie(c);
      await RoomsService.assertRoomSessionAvailable(session);
      if (session) {
        clearRoomSessionCookie(c);
      }

      const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
      void ensureSocketPubSub(server);
      const result = await RoomsService.join({
        gameCode: c.get("room").gameCode,
        displayName: c.req.valid("json").displayName,
      });
      GameEventsService.publishPlayerJoined(
        server,
        result.gameCode,
        result.player,
      );
      await GameEventsService.publishRoomSnapshot(
        server,
        result.gameCode,
        result.playerIds,
      );

      setRoomSessionCookie(c, {
        gameCode: result.gameCode,
        role: "player",
        roleId: result.playerSession.playerId,
        sessionToken: result.playerSession.sessionToken,
      });

      return c.json(
        {
          gameCode: result.gameCode,
          playerSession: result.playerSession,
        },
        201,
      );
    },
  );
