import type {
  GameActivityItem,
  GameActivitySlice,
  GameMeta,
  GamePlayers,
  GameResults,
  GameSettings,
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
import * as PlayerService from "../players/player.service";
import * as RoomsService from "./rooms.service";
import * as RoomSettingsService from "./room-settings.service";

export const getGameSummary = async (
  gameCode: string,
  settings?: GameSettings,
): Promise<GameSummary> => {
  const [meta, playerCount, queueSize] = await Promise.all([
    RoomsService.getGameMetaOrThrow(gameCode),
    PlayerService.countPlayers(gameCode),
    PoolService.getPoolSize(gameCode),
  ]);
  const resolvedSettings =
    meta.status === "lobby" && queueSize === 0
      ? settings ?? (await RoomSettingsService.getGameSettingsOrThrow(gameCode))
      : settings;

  return {
    id: meta.id,
    code: meta.code,
    roomName: meta.roomName,
    status: meta.status,
    createdAt: meta.createdAt,
    playerCount,
    queueSize:
      meta.status === "lobby" && queueSize === 0
        ? resolvedSettings!.gameplay.maxMovies
        : queueSize,
    displayConnected: isDisplayConnected(gameCode),
  };
};

export const getGamePlayers = async (
  gameCode: string,
): Promise<GamePlayers> => {
  const players = await PlayerService.listPlayers(gameCode);
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
  const players = await PlayerService.listPlayers(gameCode);
  return {
    playerProgress: await Promise.all(
      players.map(async (player) => {
        const deckStatus = await DeckService.getPlayerDeckStatus(
          gameCode,
          player.id,
        );
        return {
          playerId: player.id,
          currentIndex: deckStatus.currentIndex,
          completed: deckStatus.completed,
        };
      }),
    ),
  };
};

export const getGameMeta = async (gameCode: string): Promise<GameMeta> => {
  const settings = await RoomSettingsService.getGameSettingsOrThrow(gameCode);
  const summary = await getGameSummary(gameCode, settings);

  return {
    summary,
    settings,
  };
};

const getPlayerGameState = async (input: {
  gameCode: string;
  playerId: string;
}): Promise<PlayerGameState> => {
  const player = await PlayerService.getPlayerRecord(
    input.gameCode,
    input.playerId,
  );
  if (!player) {
    throw new UnauthorizedException("Player not found");
  }

  const [settings, currentMovieId] = await Promise.all([
    RoomSettingsService.getGameSettingsOrThrow(input.gameCode),
    DeckService.peekOrTopUpCurrentMovieId(input.gameCode, input.playerId),
  ]);
  const deckStatus = await DeckService.getPlayerDeckStatus(
    input.gameCode,
    input.playerId,
  );
  const summary = await getGameSummary(input.gameCode, settings);
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
      currentIndex: deckStatus.currentIndex,
      completed: deckStatus.completed,
    },
    currentItem,
    remainingCount: deckStatus.remainingCount,
  };
};

export const getProjectedPlayerState = async (input: {
  gameCode: string;
  playerId: string;
}): Promise<PlayerGameState> => getPlayerGameState(input);
