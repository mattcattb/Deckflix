import {createRouter} from "../common/hono";
import {
  activeDisplayMiddleware,
  clearRoomSessionCookie,
  requireGameLobby,
} from "../rooms/rooms.middleware";
import {getProjectedDisplayState} from "../games/game-state.pubsub";
import {createDisplaySocketHandler} from "./display.ws";
import {zValidator} from "@hono/zod-validator";
import {gameSettingsInputSchema} from "@deckflix/shared";
import {getBunServer} from "hono/bun";
import {ensureSocketPubSub} from "../lib/redis";
import * as RoomsService from "../rooms/rooms.service";

export const displayController = createRouter()
  .use("*", activeDisplayMiddleware)
  .get("/", async (c) => {
    return c.json(await getProjectedDisplayState(c.get("room").gameCode));
  })
  .get("/ws", createDisplaySocketHandler())
  .patch(
    "/settings",
    requireGameLobby,
    zValidator("json", gameSettingsInputSchema),
    async (c) => {
      const result = await RoomsService.updateSettings({
        gameCode: c.get("room").gameCode,
        settings: c.req.valid("json"),
      });
      return c.json(result);
    },
  )
  .post("/start", requireGameLobby, async (c) => {
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    await RoomsService.start({
      gameCode: c.get("room").gameCode,
      server,
    });
    return c.body(null, 204);
  })
  .post("/end", async (c) => {
    const {gameCode} = c.get("room");
    const {displayId, sessionToken} = c.get("displayActor");
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    await RoomsService.end({
      gameCode,
      displayId,
      sessionToken,
      server,
    });
    clearRoomSessionCookie(c);
    return c.body(null, 204);
  });
