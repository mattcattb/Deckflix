import {describe, expect, test} from "bun:test";
import type {MovieState} from "../recommendations/recommendations.service";
import {applyVoteToMovieState} from "./match-rules";

const baseState = (): MovieState => ({
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
});

const votedAt = "2026-01-01T00:00:00.000Z";

describe("match-rules", () => {
  test("keeps a positive partial vote pending", () => {
    const result = applyVoteToMovieState({
      state: baseState(),
      choice: "like",
      totalPlayers: 2,
      votedAt,
    });

    expect(result).toMatchObject({
      justMatched: false,
      state: {
        status: "pending",
        likeCount: 1,
        totalVotes: 1,
        resolvedAt: null,
        matchedAt: null,
      },
    });
  });

  test("matches when all players vote positive including super likes", () => {
    const result = applyVoteToMovieState({
      state: {
        ...baseState(),
        likeCount: 1,
        totalVotes: 1,
      },
      choice: "super_like",
      totalPlayers: 2,
      votedAt,
    });

    expect(result).toMatchObject({
      justMatched: true,
      state: {
        status: "matched",
        likeCount: 1,
        superLikeCount: 1,
        totalVotes: 2,
        resolvedAt: votedAt,
        matchedAt: votedAt,
      },
    });
  });

  test("rejects blocking votes", () => {
    const result = applyVoteToMovieState({
      state: baseState(),
      choice: "maybe",
      totalPlayers: 2,
      votedAt,
    });

    expect(result).toMatchObject({
      justMatched: false,
      state: {
        status: "rejected",
        maybeCount: 1,
        resolvedAt: votedAt,
        matchedAt: null,
      },
    });
  });
});
