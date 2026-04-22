import {describe, expect, test} from "bun:test";
import {gameVoteSummarySchema} from "./game-core";

describe("gameVoteSummarySchema", () => {
  test("defaults new activity timestamps to null for older payloads", () => {
    expect(
      gameVoteSummarySchema.parse({
        movieId: "movie-1",
        like: 1,
        dislike: 0,
        maybe: 0,
        superLike: 0,
        skip: 0,
        totalVotes: 1,
        matched: false,
        resolvedAt: null,
      }),
    ).toEqual({
      movieId: "movie-1",
      like: 1,
      dislike: 0,
      maybe: 0,
      superLike: 0,
      skip: 0,
      totalVotes: 1,
      matched: false,
      resolvedAt: null,
      lastActivityAt: null,
      matchedAt: null,
    });
  });
});
