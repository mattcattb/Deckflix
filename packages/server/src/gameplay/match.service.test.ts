import {describe, expect, test} from "bun:test";
import type {MovieState} from "./movie-state.service";
import {resolveMovieState} from "./match.service";

const state = (patch: Partial<MovieState>): MovieState => ({
  status: "pending",
  likeCount: 0,
  dislikeCount: 0,
  maybeCount: 0,
  superLikeCount: 0,
  skipCount: 0,
  totalVotes: 0,
  resolvedAt: null,
  lastActivityAt: null,
  matchedAt: null,
  ...patch,
});

describe("match.service", () => {
  test("keeps a movie alive after an early negative signal", () => {
    const result = resolveMovieState({
      state: state({dislikeCount: 1, totalVotes: 1}),
      totalPlayers: 4,
      votedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(result.state.status).toBe("pending");
  });

  test("matches strong group consensus without requiring unanimous likes", () => {
    const result = resolveMovieState({
      state: state({likeCount: 3, maybeCount: 1, totalVotes: 4}),
      totalPlayers: 4,
      votedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(result.state.status).toBe("matched");
  });

  test("requires both players to be positive in a two-person room", () => {
    const result = resolveMovieState({
      state: state({likeCount: 1, dislikeCount: 1, totalVotes: 2}),
      totalPlayers: 2,
      votedAt: "2026-07-10T00:00:00.000Z",
    });

    expect(result.state.status).toBe("rejected");
  });
});
