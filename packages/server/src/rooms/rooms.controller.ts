import {zValidator} from "@hono/zod-validator";
import {getBunServer} from "hono/bun";
import {gameSettingsInputSchema, joinGamePayloadSchema} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import {ensureSocketPubSub} from "../lib/redis";
import {
  activeDisplaySessionMiddleware,
  activeRoomMiddleware,
  clearRoomSessionCookie,
  displaySessionMiddleware,
  requireGameLobby,
  readRoomSessionCookie,
  roomMiddleware,
  setRoomSessionCookie,
} from "./rooms.middleware";
import * as RoomsService from "./rooms.service";
import {activeSwipeRoutes, playerSwipeRoutes} from "../swipe/swipe.controller";
import {activeDisplayRoutes, displayRoutes} from "../display/display.controller";

const playerRoutes = createRouter()
  .post("/", requireGameLobby, zValidator("json", joinGamePayloadSchema), async (c) => {
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
  .route("/", playerSwipeRoutes);

export const roomsController = createRouter()
  .get("/session", async (c) => {
    const session = readRoomSessionCookie(c);
    const activeClient = await RoomsService.getActiveClient(session);
    if (session && activeClient.role === "none") {
      clearRoomSessionCookie(c);
    }
    return c.json(activeClient);
  })
  .use("/me/*", activeRoomMiddleware)
  .get("/me/client", async (c) => {
    const {gameCode, session} = c.get("roomRequest");
    const client = await RoomsService.getClient({gameCode, session});
    return c.json(client);
  })
  .get("/me/meta", async (c) => {
    return c.json(await RoomsService.getMeta(c.get("roomRequest").gameCode));
  })
  .get("/me/players", async (c) => {
    return c.json(await RoomsService.getPlayers(c.get("roomRequest").gameCode));
  })
  .get("/me/results", async (c) => {
    return c.json(await RoomsService.getResults(c.get("roomRequest").gameCode));
  })
  .patch(
    "/me/settings",
    activeDisplaySessionMiddleware,
    requireGameLobby,
    zValidator("json", gameSettingsInputSchema),
    async (c) => {
      const result = await RoomsService.updateSettings({
        gameCode: c.get("roomRequest").gameCode,
        settings: c.req.valid("json"),
      });
      return c.json(result);
    },
  )
  .post("/me/start", activeDisplaySessionMiddleware, requireGameLobby, async (c) => {
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    await RoomsService.start({
      gameCode: c.get("roomRequest").gameCode,
      server,
    });
    return c.body(null, 204);
  })
  .route("/me/display", activeDisplayRoutes)
  .route("/me/player", activeSwipeRoutes)
  .delete("/me", activeDisplaySessionMiddleware, async (c) => {
    await RoomsService.remove(c.get("displaySession"));
    clearRoomSessionCookie(c);
    return c.body(null, 204);
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
  .patch(
    "/:gameCode/settings",
    displaySessionMiddleware,
    requireGameLobby,
    zValidator("json", gameSettingsInputSchema),
    async (c) => {
      const result = await RoomsService.updateSettings({
        gameCode: c.get("roomRequest").gameCode,
        settings: c.req.valid("json"),
      });
      return c.json(result);
    },
  )
  .post("/:gameCode/start", displaySessionMiddleware, requireGameLobby, async (c) => {
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    await RoomsService.start({
      gameCode: c.get("roomRequest").gameCode,
      server,
    });
    return c.body(null, 204);
  })
  .route("/:gameCode/display", displayRoutes)
  .route("/:gameCode/players", playerRoutes)
  .delete("/:gameCode", displaySessionMiddleware, async (c) => {
    await RoomsService.remove(c.get("displaySession"));
    clearRoomSessionCookie(c);
    return c.body(null, 204);
  });
