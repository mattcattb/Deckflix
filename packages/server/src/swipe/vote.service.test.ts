import {beforeEach, describe, expect, mock, test} from "bun:test";

const ensureRedis = mock();
const evalRedis = mock();
const hGetAll = mock();
const listPlayerIds = mock();

mock.module(new URL("../lib/redis.ts", import.meta.url).href, () => ({
  ensureRedis,
  redis: {
    eval: evalRedis,
    hGetAll,
  },
}));
mock.module(new URL("../rooms/room-players.service.ts", import.meta.url).href, () => ({
  listPlayerIds,
}));

const VoteService = await import(new URL("./vote.service.ts", import.meta.url).href);

const movieState = {
  status: "pending",
  likeCount: 1,
  dislikeCount: 0,
  maybeCount: 0,
  superLikeCount: 0,
  skipCount: 0,
  totalVotes: 1,
  resolvedAt: null,
  lastActivityAt: "2026-01-01T00:00:00.000Z",
  matchedAt: null,
};

beforeEach(() => {
  ensureRedis.mockReset();
  evalRedis.mockReset();
  hGetAll.mockReset();
  listPlayerIds.mockReset();

  listPlayerIds.mockResolvedValue(["player-1", "player-2"]);
});

describe("vote.service", () => {
  test("records a vote and updates movie state through one Redis script", async () => {
    evalRedis.mockResolvedValue(JSON.stringify({
      status: "recorded",
      justMatched: false,
      state: movieState,
    }));

    await expect(
      VoteService.recordVote({
        gameCode: "abcd",
        movieId: "movie-1",
        playerId: "player-1",
        choice: "like",
      }),
    ).resolves.toEqual({justMatched: false, state: movieState});

    expect(evalRedis).toHaveBeenCalledWith(
      expect.stringContaining("HSETNX"),
      expect.objectContaining({
        keys: ["game:ABCD:votes", "game:ABCD:movie_state"],
      }),
    );
    expect(evalRedis.mock.calls[0]?.[1].arguments[0]).toBe("player-1:movie-1");
    expect(evalRedis.mock.calls[0]?.[1].arguments[5]).toBe("2");
    expect(evalRedis.mock.calls[0]?.[1].arguments[6]).toBe("86400");
  });

  test("rejects duplicate votes", async () => {
    evalRedis.mockResolvedValue(JSON.stringify({status: "duplicate"}));

    await expect(
      VoteService.recordVote({
        gameCode: "abcd",
        movieId: "movie-1",
        playerId: "player-1",
        choice: "like",
      }),
    ).rejects.toThrow("Vote already recorded for this movie");
  });
});
