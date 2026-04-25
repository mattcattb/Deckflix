import {beforeEach, describe, expect, mock, test} from "bun:test";

const ensureRedis = mock();
const hGet = mock();
const hSet = mock();
const expire = mock();
const hGetAll = mock();
const hDel = mock();

mock.module(new URL("../lib/redis.ts", import.meta.url).href, () => ({
  ensureRedis,
  redis: {
    hGet,
    hSet,
    expire,
    hGetAll,
    hDel,
  },
}));

const RoomPlayersService = await import(new URL("./room-players.service.ts", import.meta.url).href);

const player = {
  id: "player-1",
  displayName: "Matt",
  joinedAt: "2026-01-01T00:00:00.000Z",
  sessionToken: "token-1",
};

beforeEach(() => {
  ensureRedis.mockReset();
  hGet.mockReset();
  hSet.mockReset();
  expire.mockReset();
  hGetAll.mockReset();
  hDel.mockReset();
});

describe("room-players.service", () => {
  test("writes player records to the room players hash", async () => {
    await RoomPlayersService.setPlayerRecord("abcd", player.id, player);

    expect(hSet).toHaveBeenCalledWith(
      "game:ABCD:players",
      "player-1",
      JSON.stringify(player),
    );
    expect(expire).toHaveBeenCalledWith("game:ABCD:players", 86400);
  });

  test("reads a single player record", async () => {
    hGet.mockResolvedValue(JSON.stringify(player));

    await expect(
      RoomPlayersService.getPlayerRecord("abcd", "player-1"),
    ).resolves.toEqual(player);
    expect(hGet).toHaveBeenCalledWith("game:ABCD:players", "player-1");
  });

  test("lists players in join order and returns ids", async () => {
    hGetAll.mockResolvedValue({
      "player-2": JSON.stringify({
        ...player,
        id: "player-2",
        joinedAt: "2026-01-01T00:00:02.000Z",
      }),
      "player-1": JSON.stringify(player),
    });

    await expect(RoomPlayersService.listPlayers("abcd")).resolves.toEqual([
      player,
      {
        ...player,
        id: "player-2",
        joinedAt: "2026-01-01T00:00:02.000Z",
      },
    ]);
    await expect(RoomPlayersService.listPlayerIds("abcd")).resolves.toEqual([
      "player-1",
      "player-2",
    ]);
  });

  test("deletes player records from the room players hash", async () => {
    await RoomPlayersService.deletePlayerRecord("abcd", "player-1");

    expect(hDel).toHaveBeenCalledWith("game:ABCD:players", "player-1");
  });
});
