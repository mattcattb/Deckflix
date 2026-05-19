import {zValidator} from "@hono/zod-validator";
import {playerProfileInputSchema} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import {
  activeRoomMiddleware,
  clearRoomSessionCookie,
  requirePlayerActor,
} from "../rooms/rooms.middleware";
import * as PlayerService from "./player.service";

export const playerController = createRouter()
  .post("/leave", activeRoomMiddleware, requirePlayerActor, async (c) => {
    const {gameCode} = c.get("room");
    const {playerId} = c.get("playerActor");
    await PlayerService.removePlayer({
      gameCode,
      playerId,
    });
    clearRoomSessionCookie(c);
    return c.body(null, 204);
  })
  .patch(
    "/me",
    activeRoomMiddleware,
    requirePlayerActor,
    zValidator("json", playerProfileInputSchema),
    async (c) => {
      const {gameCode} = c.get("room");
      const {playerId} = c.get("playerActor");
      return c.json(
        await PlayerService.updatePlayerProfile({
          gameCode,
          playerId,
          profile: c.req.valid("json"),
        }),
      );
    },
  );
