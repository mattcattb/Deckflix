import {beforeEach, describe, expect, mock, test} from "bun:test";
import {redisClient} from "../redis/redis";

const popCurrentMovieId = mock();
const peekCurrentMovieId = mock();
const getPlayerDeckStatus = mock();
const refreshPlayerDeck = mock();
const recordVote = mock();
const requestPoolExpansion = mock();

mock.module(new URL("./deck.service.ts", import.meta.url).href, () => ({
  popCurrentMovieId,
  peekCurrentMovieId,
  getPlayerDeckStatus,
  refreshPlayerDeck,
}));

mock.module(new URL("./vote.service.ts", import.meta.url).href, () => ({
  recordVote,
}));

mock.module(new URL("../pool/pool-events.ts", import.meta.url).href, () => ({
  requestPoolExpansion,
}));

const GameService = await import("./game.service");

beforeEach(() => {
  popCurrentMovieId.mockReset();
  peekCurrentMovieId.mockReset();
  getPlayerDeckStatus.mockReset();
  refreshPlayerDeck.mockReset();
  recordVote.mockReset();
  requestPoolExpansion.mockReset();
});

describe("swipe.service", () => {
  test("rejects stale client movie ids without voting", async () => {
    popCurrentMovieId.mockResolvedValue({
      status: "mismatch",
      movieId: "movie-2",
    });

    await expect(
      GameService.recordSwipe({
        gameCode: "ABCD",
        playerId: "player-1",
        movieId: "movie-1",
        choice: "like",
      }),
    ).rejects.toThrow("Vote does not match the deck head");
  });

  test("returns a waiting state when no next deck item is immediately available", async () => {
    popCurrentMovieId.mockResolvedValue({
      status: "ok",
      movieId: "movie-1",
    });
    recordVote.mockResolvedValue({
      votedAt: "2026-05-12T00:00:00.000Z",
    });
    peekCurrentMovieId.mockResolvedValue(null);
    getPlayerDeckStatus.mockResolvedValue({
      currentIndex: 10,
      completed: true,
      remainingCount: 0,
    });

    await expect(
      GameService.recordSwipe({
        gameCode: "ABCD",
        playerId: "player-1",
        movieId: "movie-1",
        choice: "like",
      }),
    ).resolves.toMatchObject({
      movieId: "movie-1",
      statePatch: {
        currentItem: null,
        remainingCount: 0,
      },
    });
    expect(requestPoolExpansion).toHaveBeenCalledWith({
      gameCode: "ABCD",
      reason: "swipe_recorded",
    });
  });

  test("tops up the player deck as part of a successful swipe", async () => {
    popCurrentMovieId.mockResolvedValue({status: "ok", movieId: "movie-1"});
    recordVote.mockResolvedValue({votedAt: "2026-05-12T00:00:00.000Z"});
    peekCurrentMovieId.mockResolvedValue(null);
    getPlayerDeckStatus.mockResolvedValue({
      currentIndex: 1,
      completed: false,
      remainingCount: 3,
    });

    await GameService.recordSwipe({
      gameCode: "ABCD",
      playerId: "player-1",
      movieId: "movie-1",
      choice: "like",
    });

    expect(refreshPlayerDeck).toHaveBeenCalledWith("ABCD", "player-1");
  });

  test("returns the cached result when a swipe action is retried", async () => {
    const actionId = "171bb596-6e9f-4539-a91f-ef35ec304e17";
    await redisClient.del("game:IDEM:swipe_actions:player-1");
    popCurrentMovieId.mockResolvedValue({status: "ok", movieId: "movie-1"});
    recordVote.mockResolvedValue({votedAt: "2026-05-12T00:00:00.000Z"});
    peekCurrentMovieId.mockResolvedValue(null);
    getPlayerDeckStatus.mockResolvedValue({
      currentIndex: 1,
      completed: false,
      remainingCount: 0,
    });

    const input = {
      gameCode: "IDEM",
      playerId: "player-1",
      movieId: "movie-1",
      choice: "like" as const,
      actionId,
    };
    const first = await GameService.recordSwipe(input);
    const second = await GameService.recordSwipe(input);

    expect(second).toEqual(first);
    expect(popCurrentMovieId).toHaveBeenCalledTimes(1);
    expect(recordVote).toHaveBeenCalledTimes(1);
    await redisClient.del("game:IDEM:swipe_actions:player-1");
  });
});
