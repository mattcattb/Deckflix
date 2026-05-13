import {describe, expect, mock, test} from "bun:test";
import * as PoolService from "../pool/pool.service";

const getRoomMovieMetadataMap = mock();
const getMovieStates = mock();

mock.module(new URL("../movies/movie-metadata.service.ts", import.meta.url).href, () => ({
  getRoomMovieMetadataMap,
}));

mock.module(new URL("../gameplay/movie-state.service.ts", import.meta.url).href, () => ({
  getMovieStates,
}));

const GameStateService = await import("./game-state.service");
const gameCode = "GST1";

const movies = new Map([
  ["movie-1", {id: "movie-1", title: "One", year: 2024, overview: "", posterUrl: "", rating: 7}],
  ["movie-2", {id: "movie-2", title: "Two", year: 2024, overview: "", posterUrl: "", rating: 7}],
  ["movie-3", {id: "movie-3", title: "Three", year: 2024, overview: "", posterUrl: "", rating: 7}],
]);

const baseState = {
  likeCount: 0,
  dislikeCount: 0,
  maybeCount: 0,
  superLikeCount: 0,
  skipCount: 0,
  totalVotes: 1,
  resolvedAt: null,
  lastActivityAt: "2026-01-01T00:00:00.000Z",
  matchedAt: null,
};

const arrangeSlices = async () => {
  await PoolService.replacePool(gameCode, ["movie-1", "movie-2", "movie-3"]);
  getRoomMovieMetadataMap.mockResolvedValue(movies);
  getMovieStates.mockResolvedValue(
    new Map([
      [
        "movie-1",
        {
          ...baseState,
          status: "matched",
          matchedAt: "2026-01-03T00:00:00.000Z",
          lastActivityAt: "2026-01-03T00:00:00.000Z",
        },
      ],
      [
        "movie-2",
        {
          ...baseState,
          status: "matched",
          matchedAt: "2026-01-04T00:00:00.000Z",
          lastActivityAt: "2026-01-04T00:00:00.000Z",
        },
      ],
      [
        "movie-3",
        {
          ...baseState,
          status: "rejected",
          dislikeCount: 1,
          resolvedAt: "2026-01-02T00:00:00.000Z",
          lastActivityAt: "2026-01-05T00:00:00.000Z",
        },
      ],
    ]),
  );
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
