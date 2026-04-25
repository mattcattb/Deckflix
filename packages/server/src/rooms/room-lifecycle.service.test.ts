import {beforeEach, describe, expect, mock, test} from "bun:test";

const ensureRedis = mock();
const keys = mock();
const del = mock();
const withRedisLock = mock(async (_input: unknown, callback: () => Promise<unknown>) =>
  callback(),
);

mock.module(new URL("../lib/redis.ts", import.meta.url).href, () => ({
  ensureRedis,
  redis: {
    keys,
    del,
  },
}));
mock.module(new URL("../lib/redis-lock.ts", import.meta.url).href, () => ({
  withRedisLock,
}));

const RoomLifecycleService = await import(new URL("./room-lifecycle.service.ts", import.meta.url).href);

beforeEach(() => {
  ensureRedis.mockReset();
  keys.mockReset();
  del.mockReset();
  withRedisLock.mockReset();
  withRedisLock.mockImplementation(
    async (_input: unknown, callback: () => Promise<unknown>) => callback(),
  );
});

describe("room-lifecycle.service", () => {
  test("normalizes room key helpers", () => {
    expect(RoomLifecycleService.normalizeGameCode(" abcd ")).toBe("ABCD");
    expect(RoomLifecycleService.roomPrefix("abcd")).toBe("game:ABCD:");
    expect(RoomLifecycleService.roomKey("abcd")).toBe("game:ABCD:room");
  });

  test("wraps the generic Redis lock with the room lock key", async () => {
    await expect(
      RoomLifecycleService.withRoomLock("abcd", async () => "locked"),
    ).resolves.toBe("locked");

    expect(withRedisLock).toHaveBeenCalledWith(
      {
        key: "game:ABCD:lock",
        ttlMs: 5000,
        retryCount: 40,
        retryDelayMs: 50,
        busyMessage: "Game is busy, please try again",
      },
      expect.any(Function),
    );
  });

  test("deletes all room-scoped Redis keys by prefix", async () => {
    keys.mockResolvedValue(["game:ABCD:room", "game:ABCD:players"]);

    await RoomLifecycleService.deleteRoomKeys("abcd");

    expect(keys).toHaveBeenCalledWith("game:ABCD:*");
    expect(del).toHaveBeenCalledWith(["game:ABCD:room", "game:ABCD:players"]);
  });
});
