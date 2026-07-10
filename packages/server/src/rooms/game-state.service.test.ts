import {randomUUID} from "node:crypto";
import {afterEach, beforeEach, describe, expect, test} from "bun:test";
import * as MovieStateService from "../gameplay/movie-state.service";
import * as MovieMetadataService from "../movies/movie-metadata.service";
import * as PoolService from "../pool/pool.service";
import {redisClient} from "../redis/redis";
import {roomPrefix} from "./room-keys";
import * as GameStateService from "./game-state.service";

let gameCode: string;

const movies = [
  {id: "movie-1", title: "One", year: 2024, overview: "", posterUrl: "", rating: 7},
  {id: "movie-2", title: "Two", year: 2024, overview: "", posterUrl: "", rating: 7},
  {id: "movie-3", title: "Three", year: 2024, overview: "", posterUrl: "", rating: 7},
];

beforeEach(() => {
  gameCode = randomUUID().replaceAll("-", "").slice(0, 8).toUpperCase();
});

afterEach(async () => {
  const keys = await redisClient.keys(`${roomPrefix(gameCode)}*`);
  if (keys.length) await redisClient.del(keys);
});

const arrangeSlices = async () => {
  const movieIds = movies.map((movie) => movie.id);
  await Promise.all([
    PoolService.replacePool(gameCode, movieIds),
    MovieMetadataService.replaceRoomMovieMetadata(gameCode, movies),
    MovieStateService.initializeMovieStates(gameCode, movieIds),
  ]);

  await Promise.all([
    MovieStateService.incrementMovieVoteState({
      gameCode,
      movieId: "movie-1",
      countField: "likeCount",
      votedAt: "2026-01-03T00:00:00.000Z",
    }),
    MovieStateService.incrementMovieVoteState({
      gameCode,
      movieId: "movie-2",
      countField: "likeCount",
      votedAt: "2026-01-04T00:00:00.000Z",
    }),
    MovieStateService.incrementMovieVoteState({
      gameCode,
      movieId: "movie-3",
      countField: "dislikeCount",
      votedAt: "2026-01-05T00:00:00.000Z",
    }),
  ]);
  await Promise.all([
    MovieStateService.setMovieResolution(gameCode, "movie-1", {
      status: "matched",
      resolvedAt: "2026-01-03T00:00:00.000Z",
      matchedAt: "2026-01-03T00:00:00.000Z",
    }),
    MovieStateService.setMovieResolution(gameCode, "movie-2", {
      status: "matched",
      resolvedAt: "2026-01-04T00:00:00.000Z",
      matchedAt: "2026-01-04T00:00:00.000Z",
    }),
    MovieStateService.setMovieResolution(gameCode, "movie-3", {
      status: "rejected",
      resolvedAt: "2026-01-02T00:00:00.000Z",
      matchedAt: null,
    }),
  ]);
};

describe("game-state.service activity slices", () => {
  test("sorts matches by newest matched time", async () => {
    await arrangeSlices();

    await expect(GameStateService.getGameMatches(gameCode)).resolves.toMatchObject({
      items: [
        {movie: {id: "movie-2"}, outcome: "match"},
        {movie: {id: "movie-1"}, outcome: "match"},
      ],
    });
  });

  test("sorts recent activity by newest activity time", async () => {
    await arrangeSlices();

    await expect(GameStateService.getGameRecent(gameCode)).resolves.toMatchObject({
      items: [
        {movie: {id: "movie-3"}},
        {movie: {id: "movie-2"}},
        {movie: {id: "movie-1"}},
      ],
    });
  });

  test("sorts stinkers by newest resolved or activity time", async () => {
    await arrangeSlices();

    await expect(GameStateService.getGameStinkers(gameCode)).resolves.toMatchObject({
      items: [{movie: {id: "movie-3"}, outcome: "rejected"}],
    });
  });
});
