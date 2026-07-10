import {zValidator} from "@hono/zod-validator";
import {playerProfileInputSchema, playerTasteInputSchema} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import {
  activeRoomMiddleware,
  clearRoomSessionCookie,
  requirePlayerActor,
} from "../rooms/rooms.middleware";
import * as PlayerService from "./player.service";
import * as PlayerTasteService from "./player-taste.service";
import * as SuggestionService from "../gameplay/suggestion.service";

export const playerController = createRouter()
  .get(
    "/me/notifications",
    activeRoomMiddleware,
    requirePlayerActor,
    async (c) =>
      c.json(
        await SuggestionService.listPlayerNotifications(
          c.get("room").gameCode,
          c.get("playerActor").playerId,
        ),
      ),
  )
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
  )
  .patch(
    "/me/taste",
    activeRoomMiddleware,
    requirePlayerActor,
    zValidator("json", playerTasteInputSchema),
    async (c) => {
      const {gameCode} = c.get("room");
      const {playerId} = c.get("playerActor");
      return c.json(
        await PlayerTasteService.setPlayerTaste(
          gameCode,
          playerId,
          c.req.valid("json"),
        ),
      );
    },
  );
