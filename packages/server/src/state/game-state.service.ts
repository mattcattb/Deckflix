import type {
  DisplayGameState,
  GameMeta,
  GamePlayers,
  GameResults,
  GameSummary,
  GameVoteSummary,
  PlayerGameState,
} from "@deckflix/shared";
import {UnauthorizedException} from "../common/errors";
import * as DeckService from "../gameplay/deck.service";
import {isDisplayConnected, isPlayerConnected} from "../presence/presence.service";
import * as RecommendationsService from "../recommendations/recommendations.service";
import {
  publishDisplayMessage,
  publishPlayerMessage,
  type RealtimeServer,
} from "../realtime/realtime.service";
import * as RoomsService from "../rooms/rooms.service";
import * as GameSettingsService from "../settings/game-settings.service";

export const getGameSummary = async (gameCode: string): Promise<GameSummary> => {
  const [meta, players, queueSize, settings] = await Promise.all([
    RoomsService.getGameMetaOrThrow(gameCode),
    RoomsService.listPlayers(gameCode),
    RecommendationsService.getPoolSize(gameCode),
    GameSettingsService.getGameSettingsOrThrow(gameCode),
  ]);

  return {
    id: meta.id,
    code: meta.code,
    roomName: meta.roomName,
    status: meta.status,
    createdAt: meta.createdAt,
    playerCount: players.length,
    queueSize:
      meta.status === "lobby" && queueSize === 0
        ? settings.gameplay.maxMovies
        : queueSize,
    displayConnected: isDisplayConnected(gameCode),
  };
};

export const getGamePlayers = async (gameCode: string): Promise<GamePlayers> => {
  const players = await RoomsService.listPlayers(gameCode);
  return {
    players: players.map((player) => ({
      id: player.id,
      displayName: player.displayName,
      joinedAt: player.joinedAt,
      connectedAsPlayer: isPlayerConnected(gameCode, player.id),
    })),
  };
};

export const getGameResults = async (gameCode: string): Promise<GameResults> => {
  const poolEntries = await RecommendationsService.listPoolEntries(gameCode);
  const movieStates = await RecommendationsService.getMovieStates(
    gameCode,
    poolEntries.map((entry) => entry.movieId),
  );

  const voteSummary: GameVoteSummary[] = poolEntries.map((entry) => {
    const movieState = movieStates.get(entry.movieId)!;
    return {
      movieId: entry.movieId,
      like: movieState.likeCount,
      dislike: movieState.dislikeCount,
      maybe: movieState.maybeCount,
      superLike: movieState.superLikeCount,
      skip: movieState.skipCount,
      totalVotes: movieState.totalVotes,
      matched: movieState.status === "matched",
      resolvedAt: movieState.resolvedAt ?? null,
      lastActivityAt: movieState.lastActivityAt ?? null,
      matchedAt: movieState.matchedAt ?? null,
    };
  });
  const matchedMovieIds = voteSummary
    .filter((entry) => entry.matched)
    .map((entry) => entry.movieId);
  const rejectedMovieIds = poolEntries
    .filter((entry) => movieStates.get(entry.movieId)?.status === "rejected")
    .map((entry) => entry.movieId);

  return {
    voteSummary,
    matchedMovieIds,
    rejectedMovieIds,
  };
};

export const getGameMeta = async (gameCode: string): Promise<GameMeta> => {
  const [summary, settings] = await Promise.all([
    getGameSummary(gameCode),
    GameSettingsService.getGameSettingsOrThrow(gameCode),
  ]);

  return {
    summary,
    settings,
  };
};

export const getDisplayGameState = async (gameCode: string): Promise<DisplayGameState> => {
  const [summary, poolEntries, players, results] = await Promise.all([
    getGameSummary(gameCode),
    RecommendationsService.listPoolEntries(gameCode),
    RoomsService.listPlayers(gameCode),
    getGameResults(gameCode),
  ]);
  const movieMetas = await RecommendationsService.getMovieMetas(
    gameCode,
    poolEntries.map((entry) => entry.movieId),
  );

  return {
    summary,
    queue: poolEntries.map((entry) => ({
      movie: movieMetas.get(entry.movieId)!,
      order: entry.order,
    })),
    playerProgress: await Promise.all(
      players.map(async (player) => ({
        playerId: player.id,
        currentIndex: await DeckService.getCurrentIndex(gameCode, player.id),
        completed: await DeckService.isPlayerCompleted(gameCode, player.id),
      })),
    ),
    results,
  };
};

export const getPlayerGameState = async (input: {
  gameCode: string;
  playerId: string;
}): Promise<PlayerGameState> => {
  const player = await RoomsService.getPlayerRecord(input.gameCode, input.playerId);
  if (!player) {
    throw new UnauthorizedException("Player not found");
  }

  const [summary, settings, currentIndex, completed, currentMovieId] = await Promise.all([
    getGameSummary(input.gameCode),
    GameSettingsService.getGameSettingsOrThrow(input.gameCode),
    DeckService.getCurrentIndex(input.gameCode, input.playerId),
    DeckService.isPlayerCompleted(input.gameCode, input.playerId),
    DeckService.peekOrTopUpCurrentMovieId(input.gameCode, input.playerId),
  ]);
  const remainingCount = await DeckService.getRemainingCount(
    input.gameCode,
    input.playerId,
  );
  const currentItem = currentMovieId
    ? {
        movie: await RecommendationsService.getMovieMetaOrThrow(
          input.gameCode,
          currentMovieId,
        ),
      }
    : null;

  return {
    summary,
    settings,
    me: {
      playerId: player.id,
      displayName: player.displayName,
      currentIndex,
      completed,
    },
    currentItem,
    remainingCount,
  };
};

export const getProjectedDisplayState = async (
  gameCode: string,
): Promise<DisplayGameState> => getDisplayGameState(gameCode);

export const getProjectedPlayerState = async (input: {
  gameCode: string;
  playerId: string;
}): Promise<PlayerGameState> => getPlayerGameState(input);

export const materializeGameState = async (gameCode: string, playerIds: string[]) => {
  const [displayState, playerEntries] = await Promise.all([
    getDisplayGameState(gameCode),
    Promise.all(
      playerIds.map(async (playerId) => [
        playerId,
        await getPlayerGameState({gameCode, playerId}),
      ] as const),
    ),
  ]);

  return {
    displayState,
    playerStates: new Map(playerEntries),
  };
};

export const publishGameState = async (
  server: RealtimeServer,
  gameCode: string,
  playerIds: string[],
) => {
  const materialized = await materializeGameState(gameCode, playerIds);

  publishDisplayMessage(server, gameCode, {
    type: "display.snapshot",
    payload: materialized.displayState,
  });

  for (const [playerId, state] of materialized.playerStates) {
    publishPlayerMessage(server, gameCode, playerId, {
      type: "player.snapshot",
      payload: state,
    });
  }

  return materialized;
};

export const clearProjectedGameState = async (
  _gameCode: string,
  _playerIds: string[],
) => undefined;
