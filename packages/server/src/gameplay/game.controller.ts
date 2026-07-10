import {zValidator} from "@hono/zod-validator";
import {finaleVotePayloadSchema, suggestMoviePayloadSchema, voteGamePayloadSchema} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import * as PreferencesService from "../rooms/room-preferences.service";
import {
  activeRoomMiddleware,
  requireDisplayActor,
  requireGameLobby,
  requireFinale,
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
  getPlayerDeckState,
  getPlayerProgress,
  getPlayerRoomState,
  refreshPlayerDeckState,
} from "../rooms/game-state.service";
import * as GameService from "./game.service";
import * as SuggestionService from "./suggestion.service";
import * as FinaleService from "./finale.service";
import * as RoomsService from "../rooms/rooms.service";
import {ConflictException} from "../common/errors";

export const gameController = createRouter()
  .use("*", activeRoomMiddleware)
  .get("/player", requirePlayerActor, async (c) => {
    const {gameCode} = c.get("room");
    const {playerId} = c.get("playerActor");
    return c.json(await getPlayerRoomState({gameCode, playerId}));
  })
  .get("/deck", requirePlayerActor, requireStartedGame, async (c) => {
    const {gameCode} = c.get("room");
    const {playerId} = c.get("playerActor");
    return c.json(await getPlayerDeckState({gameCode, playerId}));
  })
  .post("/deck/refresh", requirePlayerActor, requireStartedGame, async (c) => {
    const {gameCode} = c.get("room");
    const {playerId} = c.get("playerActor");
    return c.json(await refreshPlayerDeckState({gameCode, playerId}), 201);
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
        actionId: input.actionId,
      });

      return c.json(
        {statePatch: result.statePatch, suggestion: result.suggestion},
        201,
      );
    },
  )
  .post(
    "/suggestions",
    requirePlayerActor,
    zValidator("json", suggestMoviePayloadSchema),
    async (c) => {
      if (c.get("room").meta.status === "finale" || c.get("room").meta.status === "completed") {
        throw new ConflictException("Suggestions are closed");
      }
      const {gameCode} = c.get("room");
      const {playerId} = c.get("playerActor");
      return c.json(
        await SuggestionService.suggestMovie({
          gameCode,
          playerId,
          movieId: c.req.valid("json").movieId,
        }),
        201,
      );
    },
  )
  .get("/finale", async (c) => {
    const session = c.get("room").session;
    return c.json(
      await FinaleService.getFinaleState(
        c.get("room").gameCode,
        session?.role === "player" ? session.roleId : undefined,
      ),
    );
  })
  .post(
    "/finale/start",
    requireDisplayActor,
    requireStartedGame,
    async (c) => {
      const gameCode = c.get("room").gameCode;
      await FinaleService.createFinale(gameCode);
      await RoomsService.transitionStatus(gameCode, "swiping", "finale");
      return c.json(await FinaleService.getFinaleState(gameCode), 201);
    },
  )
  .post(
    "/finale/vote",
    requirePlayerActor,
    requireFinale,
    zValidator("json", finaleVotePayloadSchema),
    async (c) => {
      const gameCode = c.get("room").gameCode;
      const state = await FinaleService.recordFinaleVote({
        gameCode,
        playerId: c.get("playerActor").playerId,
        movieId: c.req.valid("json").movieId,
      });
      if (state.completed) {
        await RoomsService.transitionStatus(gameCode, "finale", "completed");
      }
      return c.json(state, 201);
    },
  );
