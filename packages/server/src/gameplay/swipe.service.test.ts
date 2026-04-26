import {describe, expect, mock, test} from "bun:test";

const verifyPlayerSession = mock(async () => ({player: {}}));
const evalRedis = mock();

mock.module(new URL("../rooms/rooms.service.ts", import.meta.url).href, () => ({
  normalizeGameCode: (gameCode: string) => gameCode.trim().toUpperCase(),
  verifyPlayerSession,
}));
mock.module(new URL("../lib/redis.ts", import.meta.url).href, () => ({
  ensureRedis: mock(),
  redis: {
    eval: evalRedis,
  },
}));

const SwipeService = await import("./swipe.service");

describe("swipe.service", () => {
  test("rejects stale client movie ids without voting", async () => {
    evalRedis.mockResolvedValue(["mismatch", "movie-2"]);

    await expect(
      SwipeService.recordSwipe({
        player: {
          gameCode: "ABCD",
          playerId: "player-1",
          sessionToken: "token-1",
        },
        movieId: "movie-1",
        choice: "like",
        server: {publish: mock()},
      }),
    ).rejects.toThrow("Vote does not match the deck head");
  });
});
