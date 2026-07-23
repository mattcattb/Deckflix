import {BadRequestException} from "../common/errors";
import {createChildLogger} from "../common/logger";
import * as MovieStateService from "../gameplay/movie-state.service";
import * as DeckService from "../gameplay/deck.service";
import * as MovieMetadataService from "../movies/movie-metadata.service";
import * as PreferencesService from "../rooms/room-preferences.service";
import * as PlayerService from "../players/player.service";
import * as RecommendationsService from "../recommendations/recommendations.service";
import {withRedisLock} from "../redis/redis-lock";
import * as RoomsService from "../rooms/rooms.service";
import * as RoomSettingsService from "../rooms/room-settings.service";
import {normalizeGameCode, roomPrefix} from "../rooms/room-keys";
import * as PoolService from "./pool.service";

const POOL_EXPANSION_BATCH_SIZE = 20;
const POOL_EXPANSION_LOW_WATER_BUFFER = 20;

const POOL_EXPANSION_LOCK_TTL_MS = 30_000;
const logger = createChildLogger({service: "pool.expansion"});

const expansionLockKey = (gameCode: string) =>
  `${roomPrefix(gameCode)}pool_expansion_lock`;

export const getPoolExpansionStatus = async (input: {
  gameCode: string;
  playerIds?: string[];
  buffer?: number;
}) => {
  const gameCode = normalizeGameCode(input.gameCode);
  const buffer = input.buffer ?? POOL_EXPANSION_LOW_WATER_BUFFER;
  const [poolSize, playerIds] = await Promise.all([
    PoolService.getPoolSize(gameCode),
    input.playerIds
      ? Promise.resolve(input.playerIds)
      : PlayerService.listPlayerIds(gameCode),
  ]);

  if (playerIds.length === 0) {
    return {
      shouldExpand: false,
      poolSize,
      nearestRemaining: poolSize,
    };
  }

  const cursors = await Promise.all(
    playerIds.map((playerId) =>
      DeckService.getPlayerPoolCursor(gameCode, playerId),
    ),
  );
  const remainingByPlayer = cursors.map((cursor) =>
    Math.max(0, poolSize - cursor),
  );
  const nearestRemaining = Math.min(...remainingByPlayer);

  return {
    shouldExpand: nearestRemaining <= buffer,
    poolSize,
    nearestRemaining,
  };
};

export const ensurePoolHasBuffer = async (
  input: {
    gameCode: string;
    reason?: string;
  },
  generateRecommendationExpansion =
    RecommendationsService.generateRecommendationExpansion,
) => {
  const gameCode = normalizeGameCode(input.gameCode);
  const status = await getPoolExpansionStatus({gameCode});
  if (!status.shouldExpand) {
    return {expanded: false as const, appendedMovieIds: []};
  }

  try {
    return await withRedisLock(
      {
        key: expansionLockKey(gameCode),
        ttlMs: POOL_EXPANSION_LOCK_TTL_MS,
        retryCount: 1,
        retryDelayMs: 0,
        busyMessage: "Pool expansion is already running",
      },
      async () => {
        const lockedStatus = await getPoolExpansionStatus({gameCode});
        if (!lockedStatus.shouldExpand) {
          return {expanded: false as const, appendedMovieIds: []};
        }

        const [meta, settings, preferences, existingMovieIds] =
          await Promise.all([
            RoomsService.getGameMetaOrThrow(gameCode),
            RoomSettingsService.getGameSettingsOrThrow(gameCode),
            PreferencesService.getGamePreferencesOrThrow(gameCode),
            PoolService.listPoolMovieIds(gameCode),
          ]);
        const remainingCapacity = Math.max(
          0,
          settings.gameplay.maxMovies - existingMovieIds.length,
        );
        if (remainingCapacity === 0) {
          return {expanded: false as const, appendedMovieIds: []};
        }

        const movies = await generateRecommendationExpansion({
          gameCode,
          poolSeed: meta.poolSeed,
          settings,
          preferences,
          existingMovieIds,
          targetSize: Math.min(POOL_EXPANSION_BATCH_SIZE, remainingCapacity),
        });
        const appendedMovieIds = await PoolService.appendPoolMovieIds(
          gameCode,
          movies.map((movie) => movie.id),
        );
        const appendedMovieIdSet = new Set(appendedMovieIds);
        const appendedMovies = movies.filter((movie) =>
          appendedMovieIdSet.has(movie.id),
        );

        await Promise.all([
          MovieMetadataService.upsertRoomMovieMetadata(gameCode, appendedMovies),
          MovieStateService.initializeMissingMovieStates(
            gameCode,
            appendedMovieIds,
          ),
        ]);

        return {expanded: appendedMovieIds.length > 0, appendedMovieIds};
      },
    );
  } catch (error) {
    if (
      error instanceof BadRequestException &&
      error.message === "Pool expansion is already running"
    ) {
      return {expanded: false as const, appendedMovieIds: []};
    }

    logger.error(
      {error, gameCode, reason: input.reason},
      "Failed to expand movie pool",
    );
    return {expanded: false as const, appendedMovieIds: []};
  }
};
