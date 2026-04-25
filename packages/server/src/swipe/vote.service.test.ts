import {beforeEach, describe, expect, mock, test} from "bun:test";

const ensureRedis = mock();
const hGet = mock();
const hSetNX = mock();
const hGetAll = mock();
const multiHSet = mock();
const multiExpire = mock();
const multiExec = mock();
const countPlayers = mock();
const withRedisLock = mock(async (_input: unknown, callback: () => Promise<unknown>) =>
  callback(),
);
const listPoolMovieIds = mock();

const multi = {
  hSet: multiHSet,
  expire: multiExpire,
  exec: multiExec,
};

mock.module(new URL("../lib/redis.ts", import.meta.url).href, () => ({
  ensureRedis,
  redis: {
    hGet,
    hSetNX,
    hGetAll,
    multi: () => multi,
  },
}));
mock.module(new URL("../lib/redis-lock.ts", import.meta.url).href, () => ({
  withRedisLock,
}));
mock.module(new URL("../rooms/room-players.service.ts", import.meta.url).href, () => ({
  countPlayers,
}));
mock.module(new URL("../pool/pool.service.ts", import.meta.url).href, () => ({
  listPoolMovieIds,
}));

const VoteService = await import(new URL("./vote.service.ts", import.meta.url).href);

const movieState = {
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
};

beforeEach(() => {
  ensureRedis.mockReset();
  hGet.mockReset();
  hSetNX.mockReset();
  hGetAll.mockReset();
  multiHSet.mockReset();
  multiExpire.mockReset();
  multiExec.mockReset();
  countPlayers.mockReset();
  withRedisLock.mockReset();
  listPoolMovieIds.mockReset();

  for (const fn of [multiHSet, multiExpire]) {
    fn.mockReturnValue(multi);
  }
  countPlayers.mockResolvedValue(2);
  hGet.mockResolvedValue(JSON.stringify(movieState));
  hSetNX.mockResolvedValue(true);
  withRedisLock.mockImplementation(
    async (_input: unknown, callback: () => Promise<unknown>) => callback(),
  );
});

describe("vote.service", () => {
  test("records a vote in a per-movie hash and updates movie state under a lock", async () => {
    await expect(
      VoteService.recordVote({
        gameCode: "abcd",
        movieId: "movie-1",
        playerId: "player-1",
        choice: "like",
      }),
    ).resolves.toMatchObject({
      justMatched: false,
      state: {
        likeCount: 1,
        totalVotes: 1,
        status: "pending",
      },
    });

    expect(countPlayers).toHaveBeenCalledWith("abcd");
    expect(withRedisLock).toHaveBeenCalledWith(
      {
        key: "game:ABCD:vote_lock:movie-1",
        ttlMs: 2000,
        retryCount: 20,
        retryDelayMs: 25,
        busyMessage: "Movie vote is busy, please try again",
      },
      expect.any(Function),
    );
    expect(hGet).toHaveBeenCalledWith("game:ABCD:movie_state", "movie-1");
    expect(hSetNX).toHaveBeenCalledWith(
      "game:ABCD:votes:movie-1",
      "player-1",
      expect.stringContaining("\"choice\":\"like\""),
    );
    expect(multiHSet).toHaveBeenCalledWith(
      "game:ABCD:movie_state",
      "movie-1",
      expect.stringContaining("\"likeCount\":1"),
    );
    expect(multiExpire).toHaveBeenCalledWith("game:ABCD:votes:movie-1", 86400);
    expect(multiExpire).toHaveBeenCalledWith("game:ABCD:movie_state", 86400);
    expect(multiExec).toHaveBeenCalledTimes(1);
  });

  test("marks a movie matched when all active players vote positively", async () => {
    hGet.mockResolvedValue(JSON.stringify({
      ...movieState,
      likeCount: 1,
      totalVotes: 1,
    }));

    await expect(
      VoteService.recordVote({
        gameCode: "abcd",
        movieId: "movie-1",
        playerId: "player-2",
        choice: "super_like",
      }),
    ).resolves.toMatchObject({
      justMatched: true,
      state: {
        status: "matched",
        likeCount: 1,
        superLikeCount: 1,
        totalVotes: 2,
      },
    });
  });

  test("rejects duplicate votes without updating movie state", async () => {
    hSetNX.mockResolvedValue(false);

    await expect(
      VoteService.recordVote({
        gameCode: "abcd",
        movieId: "movie-1",
        playerId: "player-1",
        choice: "like",
      }),
    ).rejects.toThrow("Vote already recorded for this movie");

    expect(multiHSet).not.toHaveBeenCalled();
    expect(multiExec).not.toHaveBeenCalled();
  });

  test("throws on missing movie state before writing a vote", async () => {
    hGet.mockResolvedValue(null);

    await expect(
      VoteService.recordVote({
        gameCode: "abcd",
        movieId: "missing",
        playerId: "player-1",
        choice: "like",
      }),
    ).rejects.toThrow("Movie missing not found in game ABCD");

    expect(hSetNX).not.toHaveBeenCalled();
    expect(multiExec).not.toHaveBeenCalled();
  });

  test("reads votes from per-movie hashes", async () => {
    hGetAll.mockResolvedValue({
      "player-1": JSON.stringify({
        choice: "like",
        votedAt: "2026-01-01T00:00:00.000Z",
      }),
    });

    await expect(
      VoteService.getMovieVoteRecords("abcd", "movie-1"),
    ).resolves.toEqual([
      {
        playerId: "player-1",
        movieId: "movie-1",
        choice: "like",
        votedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(hGetAll).toHaveBeenCalledWith("game:ABCD:votes:movie-1");
  });

  test("builds game vote records from pool movie ids without legacy vote scans", async () => {
    listPoolMovieIds.mockResolvedValue(["movie-1", "movie-2"]);
    hGetAll
      .mockResolvedValueOnce({
        "player-1": JSON.stringify({
          choice: "like",
          votedAt: "2026-01-01T00:00:00.000Z",
        }),
      })
      .mockResolvedValueOnce({});

    await expect(VoteService.getVoteRecords("abcd")).resolves.toEqual([
      {
        playerId: "player-1",
        movieId: "movie-1",
        choice: "like",
        votedAt: "2026-01-01T00:00:00.000Z",
      },
    ]);
    expect(hGetAll).toHaveBeenNthCalledWith(1, "game:ABCD:votes:movie-1");
    expect(hGetAll).toHaveBeenNthCalledWith(2, "game:ABCD:votes:movie-2");
  });
});
