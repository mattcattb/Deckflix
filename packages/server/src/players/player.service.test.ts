import {afterEach, describe, expect, test} from "bun:test";
import {redisClient} from "../redis/redis";
import {playersKey} from "../rooms/room-keys";
import {join, MAX_ROOM_PLAYERS} from "./player.service";

const gameCode = "FULL";

afterEach(() => redisClient.del(playersKey(gameCode)));

describe("player service", () => {
  test("bounds room size before creating another session", async () => {
    await redisClient.hSet(
      playersKey(gameCode),
      Object.fromEntries(
        Array.from({length: MAX_ROOM_PLAYERS}, (_, index) => [
          `player-${index}`,
          "occupied",
        ]),
      ),
    );

    await expect(join({gameCode, displayName: "One too many"})).rejects.toThrow(
      "This room is full",
    );
  });
});
