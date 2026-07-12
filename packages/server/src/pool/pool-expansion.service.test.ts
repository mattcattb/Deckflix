import {afterEach, describe, expect, mock, test} from "bun:test";
import * as MovieStateService from "../gameplay/movie-state.service";
import * as MovieMetadataService from "../movies/movie-metadata.service";
import * as PlayerService from "../players/player.service";
import * as RecommendationsService from "../recommendations/recommendations.service";
import {redisClient} from "../redis/redis";
import * as RoomsService from "../rooms/rooms.service";
import * as PoolExpansionService from "./pool-expansion.service";
import * as PoolService from "./pool.service";

const gameCodes: string[] = [];
const movie = {
  id: "movie-3",
  title: "Three",
  year: 2026,
  overview: "",
  posterUrl: "",
  rating: 7,
};

const createRoomWithPlayer = async () => {
  const {gameCode} = await RoomsService.create({roomName: "Expansion test"});
  gameCodes.push(gameCode);
  await PlayerService.join({gameCode, displayName: "Player one"});
  return gameCode;
};

afterEach(async () => {
  for (const gameCode of gameCodes.splice(0)) {
    const keys = await redisClient.keys(`game:${gameCode}:*`);
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
  }
});

describe("pool-expansion.service", () => {
  test("requests expansion when a player cursor is near the pool end", async () => {
    const gameCode = await createRoomWithPlayer();
    await PoolService.replacePool(gameCode, ["movie-1", "movie-2"]);

    await expect(
      PoolExpansionService.getPoolExpansionStatus({gameCode}),
    ).resolves.toMatchObject({
      shouldExpand: true,
      poolSize: 2,
      nearestRemaining: 2,
    });
  });

  test("does not expand when enough pool entries remain", async () => {
    const gameCode = await createRoomWithPlayer();
    await PoolService.replacePool(
      gameCode,
      Array.from({length: 100}, (_, index) => `movie-${index + 1}`),
    );
    const generateRecommendations = mock(
      async (
        _input: Parameters<
          typeof RecommendationsService.generateRecommendationExpansion
        >[0],
      ) => [movie],
    );

    await expect(
      PoolExpansionService.ensurePoolHasBuffer(
        {gameCode},
        generateRecommendations,
      ),
    ).resolves.toEqual({expanded: false, appendedMovieIds: []});
    expect(generateRecommendations).not.toHaveBeenCalled();
  });

  test("persists expanded movies and initializes their state", async () => {
    const gameCode = await createRoomWithPlayer();
    await PoolService.replacePool(gameCode, ["movie-1", "movie-2"]);
    const generateRecommendations = mock(
      async (
        _input: Parameters<
          typeof RecommendationsService.generateRecommendationExpansion
        >[0],
      ) => [movie],
    );

    await expect(
      PoolExpansionService.ensurePoolHasBuffer(
        {gameCode},
        generateRecommendations,
      ),
    ).resolves.toEqual({expanded: true, appendedMovieIds: [movie.id]});

    expect(generateRecommendations).toHaveBeenCalledTimes(1);
    expect(generateRecommendations.mock.calls[0]?.[0]).toMatchObject({
      gameCode,
      existingMovieIds: ["movie-1", "movie-2"],
      targetSize: 20,
    });
    await expect(PoolService.listPoolMovieIds(gameCode)).resolves.toEqual([
      "movie-1",
      "movie-2",
      movie.id,
    ]);
    await expect(
      MovieMetadataService.getRoomMovieMetadataOrThrow(gameCode, movie.id),
    ).resolves.toEqual(movie);
    await expect(
      MovieStateService.getMovieStateOrThrow(gameCode, movie.id),
    ).resolves.toMatchObject({status: "pending", totalVotes: 0});
  });

  test("lock prevents duplicate concurrent expansion work", async () => {
    const gameCode = await createRoomWithPlayer();
    await PoolService.replacePool(gameCode, ["movie-1", "movie-2"]);
    const generateRecommendations = mock(
      (
        _input: Parameters<
          typeof RecommendationsService.generateRecommendationExpansion
        >[0],
      ) =>
        new Promise<typeof movie[]>((resolve) =>
          setTimeout(() => resolve([movie]), 50),
        ),
    );

    const [first, second] = await Promise.all([
      PoolExpansionService.ensurePoolHasBuffer(
        {gameCode},
        generateRecommendations,
      ),
      PoolExpansionService.ensurePoolHasBuffer(
        {gameCode},
        generateRecommendations,
      ),
    ]);

    expect([first, second].filter((result) => result.expanded)).toHaveLength(1);
    expect(generateRecommendations).toHaveBeenCalledTimes(1);
  });
});
