import {beforeEach, describe, expect, mock, test} from "bun:test";

const popCurrentMovieId = mock();
const peekCurrentMovieId = mock();
const getPlayerDeckStatus = mock();
const recordVote = mock();
const requestPoolExpansion = mock();

mock.module(new URL("./deck.service.ts", import.meta.url).href, () => ({
  popCurrentMovieId,
  peekCurrentMovieId,
  getPlayerDeckStatus,
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
});
