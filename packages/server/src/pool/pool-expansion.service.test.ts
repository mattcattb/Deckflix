import {afterEach, beforeEach, describe, expect, mock, test} from "bun:test";
import {redisClient} from "../redis/redis";
import {roomPrefix} from "../rooms/room-keys";
import * as PoolService from "./pool.service";

const getPlayerPoolCursor = mock();
const initializeMissingMovieStates = mock();
const upsertRoomMovieMetadata = mock();
const getGamePreferencesOrThrow = mock();
const listPlayerIds = mock();
const generateRecommendationExpansion = mock();
const getGameMetaOrThrow = mock();
const getGameSettingsOrThrow = mock();

mock.module(new URL("../gameplay/deck.service.ts", import.meta.url).href, () => ({
  getPlayerPoolCursor,
}));

mock.module(
  new URL("../gameplay/movie-state.service.ts", import.meta.url).href,
  () => ({
    initializeMissingMovieStates,
  }),
);

mock.module(
  new URL("../movies/movie-metadata.service.ts", import.meta.url).href,
  () => ({
    upsertRoomMovieMetadata,
  }),
);

mock.module(new URL("../rooms/room-preferences.service.ts", import.meta.url).href, () => ({
  getGamePreferencesOrThrow,
}));

mock.module(new URL("../players/player.service.ts", import.meta.url).href, () => ({
  listPlayerIds,
}));

mock.module(
  new URL("../recommendations/recommendations.service.ts", import.meta.url).href,
  () => ({
    generateRecommendationExpansion,
  }),
);

mock.module(new URL("../rooms/rooms.service.ts", import.meta.url).href, () => ({
  getGameMetaOrThrow,
}));

mock.module(
  new URL("../rooms/room-settings.service.ts", import.meta.url).href,
  () => ({
    getGameSettingsOrThrow,
  }),
);

const PoolExpansionService = await import("./pool-expansion.service");

const movie = {
  id: "movie-3",
  title: "Three",
  year: 2026,
  overview: "",
  posterUrl: "",
  rating: 7,
};
const preferences = {
  popularityPreset: "balanced",
  includedGenreIds: [],
  excludedGenreIds: [],
  primaryReleaseDateGte: null,
  primaryReleaseDateLte: null,
  voteAverageGte: null,
  voteAverageLte: null,
};
const settings = {
  gameplay: {
    maxMovies: 100,
    allowMaybe: true,
    allowSuperLike: true,
  },
};

beforeEach(() => {
  getPlayerPoolCursor.mockReset();
  initializeMissingMovieStates.mockReset();
  upsertRoomMovieMetadata.mockReset();
  getGamePreferencesOrThrow.mockReset();
  listPlayerIds.mockReset();
  generateRecommendationExpansion.mockReset();
  getGameMetaOrThrow.mockReset();
  getGameSettingsOrThrow.mockReset();

  listPlayerIds.mockResolvedValue(["player-1"]);
  getPlayerPoolCursor.mockResolvedValue(0);
  getGameMetaOrThrow.mockResolvedValue({poolSeed: "seed-1"});
  getGameSettingsOrThrow.mockResolvedValue(settings);
  getGamePreferencesOrThrow.mockResolvedValue(preferences);
  generateRecommendationExpansion.mockResolvedValue([movie]);
  upsertRoomMovieMetadata.mockResolvedValue(undefined);
  initializeMissingMovieStates.mockResolvedValue(undefined);
});

afterEach(async () => {
  await redisClient.del(
    ["ABCD", "LOCK"].flatMap((gameCode) => [
      `${roomPrefix(gameCode)}pool`,
      `${roomPrefix(gameCode)}pool_expansion_lock`,
    ]),
  );
});

describe("pool-expansion.service", () => {
  test("requests expansion when a player cursor is near the pool end", async () => {
    await PoolService.replacePool("ABCD", ["movie-1", "movie-2"]);

    await expect(
      PoolExpansionService.getPoolExpansionStatus({gameCode: "ABCD"}),
    ).resolves.toMatchObject({
      shouldExpand: true,
      poolSize: 2,
      nearestRemaining: 2,
    });
  });

  test("does not expand when enough pool entries remain", async () => {
    await PoolService.replacePool(
      "ABCD",
      Array.from({length: 100}, (_, index) => `movie-${index + 1}`),
    );
    getPlayerPoolCursor.mockResolvedValue(40);

    await expect(
      PoolExpansionService.ensurePoolHasBuffer({gameCode: "ABCD"}),
    ).resolves.toEqual({expanded: false, appendedMovieIds: []});
    expect(generateRecommendationExpansion).not.toHaveBeenCalled();
  });

  test("expands with existing ids excluded and initializes appended movie state", async () => {
    await PoolService.replacePool("ABCD", ["movie-1", "movie-2"]);

    await expect(
      PoolExpansionService.ensurePoolHasBuffer({gameCode: "ABCD"}),
    ).resolves.toEqual({expanded: true, appendedMovieIds: [movie.id]});

    expect(generateRecommendationExpansion).toHaveBeenCalledWith({
      gameCode: "ABCD",
      poolSeed: "seed-1",
      settings,
      preferences,
      existingMovieIds: ["movie-1", "movie-2"],
      targetSize: 20,
    });
    expect(upsertRoomMovieMetadata).toHaveBeenCalledWith("ABCD", [movie]);
    expect(initializeMissingMovieStates).toHaveBeenCalledWith("ABCD", [
      movie.id,
    ]);
    await expect(PoolService.listPoolMovieIds("ABCD")).resolves.toEqual([
      "movie-1",
      "movie-2",
      movie.id,
    ]);
  });

  test("lock prevents duplicate concurrent expansion work", async () => {
    await PoolService.replacePool("LOCK", ["movie-1", "movie-2"]);
    generateRecommendationExpansion.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve([movie]), 50)),
    );

    const [first, second] = await Promise.all([
      PoolExpansionService.ensurePoolHasBuffer({gameCode: "LOCK"}),
      PoolExpansionService.ensurePoolHasBuffer({gameCode: "LOCK"}),
    ]);

    expect([first, second].filter((result) => result.expanded)).toHaveLength(1);
    expect(generateRecommendationExpansion).toHaveBeenCalledTimes(1);
  });
});
