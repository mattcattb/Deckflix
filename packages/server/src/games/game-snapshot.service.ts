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
import * as GameStateService from "./game-state.service";
import {isDisplayConnected, isPlayerConnected} from "../ws/presence.ws";
import * as GameRedisService from "./game-redis.service";
import * as RoomMetaService from "../rooms/room-meta.service";

const buildSummary = async (gameCode: string): Promise<GameSummary> => {
  const [meta, players, queueSize] = await Promise.all([
    RoomMetaService.getGameMetaOrThrow(gameCode),
    GameRedisService.listPlayers(gameCode),
    GamePoolService.getPoolSize(gameCode),
  ]);

  return {
    id: meta.id,
    code: meta.code,
    roomName: meta.roomName,
    status: meta.status,
    createdAt: meta.createdAt,
    playerCount: players.length,
    queueSize,
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
        currentIndex: await GameStateService.getPlayerCurrentIndex(gameCode, player.id),
        completed: await GameStateService.isPlayerCompleted(gameCode, player.id),
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

  const [summary, settings, currentItem, currentIndex, completed, remainingCount] =
    await Promise.all([
      buildSummary(input.gameCode),
      GameSettingsService.getGameSettingsOrThrow(input.gameCode),
      GameStateService.getCurrentMovie(input.gameCode, input.playerId),
      GameStateService.getPlayerCurrentIndex(input.gameCode, input.playerId),
      GameStateService.isPlayerCompleted(input.gameCode, input.playerId),
      GameStateService.getPlayerRemainingCount(input.gameCode, input.playerId),
    ]);

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
