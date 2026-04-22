import {createRouter} from "../common/hono";
import {
  activeDisplaySessionMiddleware,
  clearRoomSessionCookie,
  requireGameLobby,
} from "../rooms/rooms.middleware";
import * as DisplayService from "./display.service";
import {createDisplaySocketHandler} from "./display.ws";
import {zValidator} from "@hono/zod-validator";
import {gameSettingsInputSchema} from "@deckflix/shared";
import {getBunServer} from "hono/bun";
import {ensureSocketPubSub} from "../lib/redis";
import * as RoomsService from "../rooms/rooms.service";

export const displayController = createRouter()
  .use("*", activeDisplaySessionMiddleware)
  .get("/state", async (c) => {
    return c.json(await DisplayService.getDisplayState(c.get("roomRequest").gameCode));
  })
  .get("/ws", createDisplaySocketHandler())
  .patch(
    "/settings",
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
  .post("/start", requireGameLobby, async (c) => {
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);
    await RoomsService.start({
      gameCode: c.get("roomRequest").gameCode,
      server,
    });
    return c.body(null, 204);
  })
  .delete("/", async (c) => {
    await RoomsService.remove(c.get("displaySession"));
    clearRoomSessionCookie(c);
    return c.body(null, 204);
  });
