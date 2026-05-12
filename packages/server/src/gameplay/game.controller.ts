import {zValidator} from "@hono/zod-validator";
import {voteGamePayloadSchema} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import * as PreferencesService from "../movies/preferences.service";
import {
  activeRoomMiddleware,
  requireDisplayActor,
  requireGameLobby,
  requirePlayerActor,
  requireStartedGame,
} from "../rooms/rooms.middleware";
import {
  getGameMatches,
  getGameQueue,
  getGameRecent,
  getGameResults,
  getGameSummary,
  getGameStinkers,
  getPlayerProgress,
  getProjectedPlayerState,
} from "../rooms/game-state.service";
import * as GameService from "./game.service";

export const gameController = createRouter()
  .use("*", activeRoomMiddleware)
  .get("/player", requirePlayerActor, async (c) => {
    const {gameCode} = c.get("room");
    const {playerId} = c.get("playerActor");
    return c.json(await getProjectedPlayerState({gameCode, playerId}));
  })
  .get("/summary", async (c) => {
    return c.json(await getGameSummary(c.get("room").gameCode));
  })
  .get("/queue", async (c) => {
    return c.json(await getGameQueue(c.get("room").gameCode));
  })
  .get("/progress", async (c) => {
    return c.json(await getPlayerProgress(c.get("room").gameCode));
  })
  .get("/results", async (c) => {
    return c.json(await getGameResults(c.get("room").gameCode));
  })
  .get("/matches", async (c) => {
    return c.json(await getGameMatches(c.get("room").gameCode));
  })
  .get("/recent", async (c) => {
    return c.json(await getGameRecent(c.get("room").gameCode));
  })
  .get("/stinkers", async (c) => {
    return c.json(await getGameStinkers(c.get("room").gameCode));
  })
  .get("/preferences", async (c) => {
    return c.json(
      await PreferencesService.getGamePreferencesOrThrow(
        c.get("room").gameCode,
      ),
    );
  })
  .patch(
    "/preferences",
    requireDisplayActor,
    requireGameLobby,
    zValidator("json", PreferencesService.gamePreferencesPatchSchema),
    async (c) => {
      return c.json(
        await PreferencesService.patchGamePreferences(
          c.get("room").gameCode,
          c.req.valid("json"),
        ),
      );
    },
  )
  .post(
    "/vote",
    requirePlayerActor,
    requireStartedGame,
    zValidator("json", voteGamePayloadSchema),
    async (c) => {
      const input = c.req.valid("json");
      const {gameCode} = c.get("room");
      const {playerId} = c.get("playerActor");
      const result = await GameService.recordSwipe({
        gameCode,
        playerId,
        movieId: input.movieId,
        choice: input.choice,
      });

      return c.json({statePatch: result.statePatch}, 201);
    },
  );
