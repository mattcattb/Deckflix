import type {
  GameActivityItem,
  GameActivitySlice,
  GameMeta,
  GamePlayers,
  GameResults,
  GameSummary,
  GameVoteSummary,
  PlayerGameState,
} from "@deckflix/shared";
import {UnauthorizedException} from "../common/errors";
import * as DeckService from "../gameplay/deck.service";
import {
  isDisplayConnected,
  isPlayerConnected,
} from "../presence/presence.service";
import * as MovieStateService from "../gameplay/movie-state.service";
import * as PoolService from "../recommendations/pool.service";
import {
  publishPlayerMessage,
  type RealtimeServer,
} from "../realtime/realtime.service";
import * as RoomsService from "./rooms.service";
import * as RoomSettingsService from "./room-settings.service";

export const getGameSummary = async (
  gameCode: string,
): Promise<GameSummary> => {
  const [meta, players, queueSize, settings] = await Promise.all([
    RoomsService.getGameMetaOrThrow(gameCode),
    RoomsService.listPlayers(gameCode),
    PoolService.getPoolSize(gameCode),
    RoomSettingsService.getGameSettingsOrThrow(gameCode),
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

export const getGamePlayers = async (
  gameCode: string,
): Promise<GamePlayers> => {
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

export const getGameResults = async (
  gameCode: string,
): Promise<GameResults> => {
  const poolEntries = await PoolService.listPoolEntries(gameCode);
  const movieStates = await MovieStateService.getMovieStates(
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

const getTimestamp = (value: string | null | undefined) =>
  value ? Date.parse(value) : 0;

const getResolvedTimestamp = (item: GameActivityItem) =>
  getTimestamp(item.votes.resolvedAt) || getTimestamp(item.votes.lastActivityAt);

const getActivityItems = async (gameCode: string) => {
  const poolEntries = await PoolService.listPoolEntries(gameCode);
  const movieIds = poolEntries.map((entry) => entry.movieId);
  const [movieStates, movieMetas] = await Promise.all([
    MovieStateService.getMovieStates(gameCode, movieIds),
    PoolService.getMovieMetas(gameCode, movieIds),
  ]);

  return poolEntries
    .map((entry) => {
      const movieState = movieStates.get(entry.movieId)!;
      const votes: GameVoteSummary = {
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

      if (votes.totalVotes === 0 || !votes.lastActivityAt) {
        return null;
      }

      const outcome =
        movieState.status === "matched"
          ? "match"
          : movieState.status === "rejected"
            ? "rejected"
            : "active";

      return {
        movie: movieMetas.get(entry.movieId)!,
        votes,
        outcome,
      } satisfies GameActivityItem;
    })
    .filter((item): item is GameActivityItem => Boolean(item));
};

export const getGameMatches = async (
  gameCode: string,
): Promise<GameActivitySlice> => {
  const items = await getActivityItems(gameCode);
  return {
    items: items
      .filter((item) => item.outcome === "match")
      .sort(
        (left, right) =>
          getTimestamp(right.votes.matchedAt) -
            getTimestamp(left.votes.matchedAt) ||
          getTimestamp(right.votes.lastActivityAt) -
            getTimestamp(left.votes.lastActivityAt),
      ),
  };
};

export const getGameRecent = async (
  gameCode: string,
): Promise<GameActivitySlice> => {
  const items = await getActivityItems(gameCode);
  return {
    items: items.sort(
      (left, right) =>
        getTimestamp(right.votes.lastActivityAt) -
        getTimestamp(left.votes.lastActivityAt),
    ),
  };
};

export const getGameStinkers = async (
  gameCode: string,
): Promise<GameActivitySlice> => {
  const items = await getActivityItems(gameCode);
  return {
    items: items
      .filter((item) => item.outcome === "rejected")
      .sort((left, right) => getResolvedTimestamp(right) - getResolvedTimestamp(left)),
  };
};

export const getGameQueue = async (gameCode: string) => {
  const poolEntries = await PoolService.listPoolEntries(gameCode);
  const movieMetas = await PoolService.getMovieMetas(
    gameCode,
    poolEntries.map((entry) => entry.movieId),
  );

  return {
    queue: poolEntries.map((entry) => ({
      movie: movieMetas.get(entry.movieId)!,
      order: entry.order,
    })),
  };
};

export const getPlayerProgress = async (gameCode: string) => {
  const players = await RoomsService.listPlayers(gameCode);
  return {
    playerProgress: await Promise.all(
      players.map(async (player) => ({
        playerId: player.id,
        currentIndex: await DeckService.getCurrentIndex(gameCode, player.id),
        completed: await DeckService.isPlayerCompleted(gameCode, player.id),
      })),
    ),
  };
};

export const getGameMeta = async (gameCode: string): Promise<GameMeta> => {
  const [summary, settings] = await Promise.all([
    getGameSummary(gameCode),
    RoomSettingsService.getGameSettingsOrThrow(gameCode),
  ]);

  return {
    summary,
    settings,
  };
};

const getPlayerGameState = async (input: {
  gameCode: string;
  playerId: string;
}): Promise<PlayerGameState> => {
  const player = await RoomsService.getPlayerRecord(
    input.gameCode,
    input.playerId,
  );
  if (!player) {
    throw new UnauthorizedException("Player not found");
  }

  const [summary, settings, currentIndex, completed, currentMovieId] =
    await Promise.all([
      getGameSummary(input.gameCode),
      RoomSettingsService.getGameSettingsOrThrow(input.gameCode),
      DeckService.getCurrentIndex(input.gameCode, input.playerId),
      DeckService.isPlayerCompleted(input.gameCode, input.playerId),
      DeckService.peekOrTopUpCurrentMovieId(input.gameCode, input.playerId),
    ]);
  const remainingCount = await DeckService.getDeckLength(
    input.gameCode,
    input.playerId,
  );
  const currentItem = currentMovieId
    ? {
        movie: await PoolService.getMovieMetaOrThrow(
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

export const getProjectedPlayerState = async (input: {
  gameCode: string;
  playerId: string;
}): Promise<PlayerGameState> => getPlayerGameState(input);

const materializePlayerStates = async (
  gameCode: string,
  playerIds: string[],
) => {
  const playerEntries = await Promise.all(
    playerIds.map(
      async (playerId) =>
        [playerId, await getPlayerGameState({gameCode, playerId})] as const,
    ),
  );

  return {
    playerStates: new Map(playerEntries),
  };
};

export const publishPlayerSnapshots = async (
  server: RealtimeServer,
  gameCode: string,
  playerIds: string[],
) => {
  const materialized = await materializePlayerStates(gameCode, playerIds);

  for (const [playerId, state] of materialized.playerStates) {
    publishPlayerMessage(server, gameCode, playerId, {
      type: "player.snapshot",
      payload: state,
    });
  }

  return materialized;
};
