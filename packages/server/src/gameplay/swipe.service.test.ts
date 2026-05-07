import {describe, expect, mock, test} from "bun:test";

const popCurrentMovieId = mock();

mock.module(new URL("./deck.service.ts", import.meta.url).href, () => ({
  popCurrentMovieId,
}));

const GameService = await import("./game.service");

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
        server: {publish: mock()},
      }),
    ).rejects.toThrow("Vote does not match the deck head");
  });
});
