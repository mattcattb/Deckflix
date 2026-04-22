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
import * as GamePoolService from "./game-pool.service";
import * as GameSettingsService from "../settings/game-settings.service";
import * as SwipeLedgerService from "../swipe/swipe-ledger.service";
import * as SwipeService from "../swipe/swipe.service";
import {isDisplayConnected, isPlayerConnected} from "../ws/presence.ws";
import * as GameRedisService from "./game-redis.service";
import * as RoomMetaService from "../rooms/room-meta.service";

const buildSummary = async (gameCode: string): Promise<GameSummary> => {
  const [meta, players, queueSize, settings] = await Promise.all([
    RoomMetaService.getGameMetaOrThrow(gameCode),
    GameRedisService.listPlayers(gameCode),
    GamePoolService.getPoolSize(gameCode),
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

const buildPlayers = async (gameCode: string) => {
  const players = await GameRedisService.listPlayers(gameCode);
  return players.map((player) => ({
    id: player.id,
    displayName: player.displayName,
    joinedAt: player.joinedAt,
    connectedAsPlayer: isPlayerConnected(gameCode, player.id),
  }));
};

const buildResults = async (gameCode: string): Promise<GameResults> => {
  const [poolEntries, matchedMovieIds, rejectedMovieIds] = await Promise.all([
    GamePoolService.getPoolEntries(gameCode),
    SwipeLedgerService.getMatchedMovieIds(gameCode),
    SwipeLedgerService.getRejectedMovieIds(gameCode),
  ]);
  const movieRecords = await GameRedisService.getMovieRecords(
    gameCode,
    poolEntries.map((entry) => entry.movieId),
  );

  const voteSummary: GameVoteSummary[] = poolEntries.map((entry) => {
    const movieRecord = movieRecords.get(entry.movieId)!;
    return {
      movieId: entry.movieId,
      like: movieRecord.likeCount,
      dislike: movieRecord.dislikeCount,
      maybe: movieRecord.maybeCount,
      superLike: movieRecord.superLikeCount,
      skip: movieRecord.skipCount,
      totalVotes: movieRecord.totalVotes,
      matched: movieRecord.status === "matched",
      resolvedAt: movieRecord.resolvedAt ?? null,
      lastActivityAt: movieRecord.lastActivityAt ?? null,
      matchedAt: movieRecord.matchedAt ?? null,
    };
  });

  return {
    voteSummary,
    matchedMovieIds,
    rejectedMovieIds,
  };
};

export const getGameSummary = async (gameCode: string) => buildSummary(gameCode);

export const getGameMeta = async (gameCode: string): Promise<GameMeta> => {
  const [summary, settings] = await Promise.all([
    buildSummary(gameCode),
    GameSettingsService.getGameSettingsOrThrow(gameCode),
  ]);

  return {
    summary,
    settings,
  };
};

export const getGamePlayers = async (gameCode: string): Promise<GamePlayers> => ({
  players: await buildPlayers(gameCode),
});

export const getGameResults = async (gameCode: string): Promise<GameResults> =>
  buildResults(gameCode);

export const getDisplayGameState = async (gameCode: string): Promise<DisplayGameState> => {
  const [summary, poolEntries, players, results] = await Promise.all([
    buildSummary(gameCode),
    GamePoolService.getPoolEntries(gameCode),
    GameRedisService.listPlayers(gameCode),
    buildResults(gameCode),
  ]);
  const movieRecords = await GameRedisService.getMovieRecords(
    gameCode,
    poolEntries.map((entry) => entry.movieId),
  );

  return {
    summary,
    queue: poolEntries.map((entry) => ({
      movie: movieRecords.get(entry.movieId)!.movie,
      order: entry.order,
    })),
    playerProgress: await Promise.all(
      players.map(async (player) => ({
        playerId: player.id,
        currentIndex: await SwipeService.getPlayerCurrentIndex(gameCode, player.id),
        completed: await SwipeService.isPlayerCompleted(gameCode, player.id),
      })),
    ),
    results,
  };
};

export const getPlayerGameState = async (input: {
  gameCode: string;
  playerId: string;
}): Promise<PlayerGameState> => {
  const player = await GameRedisService.getPlayerRecord(input.gameCode, input.playerId);
  if (!player) {
    throw new UnauthorizedException("Player not found");
  }

  const [summary, settings, currentIndex, completed, currentItem] = await Promise.all([
    buildSummary(input.gameCode),
    GameSettingsService.getGameSettingsOrThrow(input.gameCode),
    SwipeService.getPlayerCurrentIndex(input.gameCode, input.playerId),
    SwipeService.isPlayerCompleted(input.gameCode, input.playerId),
    SwipeService.getCurrentOrNextMovie(input.gameCode, input.playerId),
  ]);
  const remainingCount = await SwipeService.getPlayerRemainingCount(
    input.gameCode,
    input.playerId,
  );

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
