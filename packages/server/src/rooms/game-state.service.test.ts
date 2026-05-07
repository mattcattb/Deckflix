import {describe, expect, mock, test} from "bun:test";

const listPoolEntries = mock();
const getMovieMetas = mock();
const getMovieStates = mock();

mock.module(new URL("../recommendations/pool.service.ts", import.meta.url).href, () => ({
  listPoolEntries,
  getMovieMetas,
}));

mock.module(new URL("../gameplay/movie-state.service.ts", import.meta.url).href, () => ({
  getMovieStates,
}));

const GameStateService = await import("./game-state.service");

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

const arrangeSlices = () => {
  listPoolEntries.mockResolvedValue([
    {movieId: "movie-1", order: 0},
    {movieId: "movie-2", order: 1},
    {movieId: "movie-3", order: 2},
  ]);
  getMovieMetas.mockResolvedValue(movies);
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
    arrangeSlices();

    await expect(GameStateService.getGameMatches("ABCD")).resolves.toMatchObject({
      items: [
        {movie: {id: "movie-2"}, outcome: "match"},
        {movie: {id: "movie-1"}, outcome: "match"},
      ],
    });
  });

  test("sorts recent activity by newest activity time", async () => {
    arrangeSlices();

    await expect(GameStateService.getGameRecent("ABCD")).resolves.toMatchObject({
      items: [
        {movie: {id: "movie-3"}},
        {movie: {id: "movie-2"}},
        {movie: {id: "movie-1"}},
      ],
    });
  });

  test("sorts stinkers by newest resolved or activity time", async () => {
    arrangeSlices();

    await expect(GameStateService.getGameStinkers("ABCD")).resolves.toMatchObject({
      items: [{movie: {id: "movie-3"}, outcome: "rejected"}],
    });
  });
});
