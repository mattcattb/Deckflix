import {beforeEach, describe, expect, mock, test} from "bun:test";

const ensureRedis = mock();
const del = mock();
const lLen = mock();
const get = mock();
const lIndex = mock();
const sIsMember = mock();
const evalRedis = mock();
const multiRPush = mock();
const multiSAdd = mock();
const multiExpire = mock();
const multiSet = mock();
const multiExec = mock();
const listPoolEntries = mock();
const getPoolSize = mock();
const getGameMetaOrThrow = mock();

const multi = {
  rPush: multiRPush,
  sAdd: multiSAdd,
  expire: multiExpire,
  set: multiSet,
  exec: multiExec,
};

mock.module(new URL("../lib/redis.ts", import.meta.url).href, () => ({
  ensureRedis,
  redis: {
    del,
    lLen,
    get,
    lIndex,
    sIsMember,
    eval: evalRedis,
    multi: () => multi,
  },
}));
mock.module(new URL("../pool/pool.service.ts", import.meta.url).href, () => ({
  listPoolEntries,
  getPoolSize,
}));
mock.module(new URL("../rooms/room-meta.service.ts", import.meta.url).href, () => ({
  getGameMetaOrThrow,
}));

const DeckService = await import(new URL("./deck.service.ts", import.meta.url).href);

beforeEach(() => {
  ensureRedis.mockReset();
  del.mockReset();
  lLen.mockReset();
  get.mockReset();
  lIndex.mockReset();
  sIsMember.mockReset();
  evalRedis.mockReset();
  multiRPush.mockReset();
  multiSAdd.mockReset();
  multiExpire.mockReset();
  multiSet.mockReset();
  multiExec.mockReset();
  listPoolEntries.mockReset();
  getPoolSize.mockReset();
  getGameMetaOrThrow.mockReset();

  for (const fn of [multiRPush, multiSAdd, multiExpire, multiSet]) {
    fn.mockReturnValue(multi);
  }
  getGameMetaOrThrow.mockResolvedValue({poolSeed: "seed-1"});
});

describe("deck.service", () => {
  test("tops up a player deck from unassigned pool entries", async () => {
    lLen.mockResolvedValue(0);
    get.mockResolvedValue("0");
    listPoolEntries.mockResolvedValue([
      {movieId: "movie-1", order: 0},
      {movieId: "movie-2", order: 1},
      {movieId: "movie-3", order: 2},
    ]);
    sIsMember.mockResolvedValue(false);

    await DeckService.topUpPlayerDeck("abcd", "player-1", 2);

    expect(multiRPush).toHaveBeenCalledTimes(1);
    const enqueued = multiRPush.mock.calls[0]?.[1] as string[];
    expect(enqueued).toHaveLength(2);
    expect(new Set(enqueued).size).toBe(2);
    expect(multiSAdd).toHaveBeenCalledWith("game:ABCD:deck_assigned:player-1", enqueued);
    expect(multiSet).toHaveBeenCalledWith(
      "game:ABCD:deck_cursor:player-1",
      expect.any(String),
      {EX: 86400},
    );
  });

  test("compare-pops the current deck head atomically", async () => {
    evalRedis.mockResolvedValue(["popped", "movie-1"]);

    await expect(
      DeckService.popCurrentMovieId("abcd", "player-1", "movie-1"),
    ).resolves.toEqual({status: "popped", movieId: "movie-1"});
    expect(evalRedis).toHaveBeenCalledWith(
      expect.stringContaining("LINDEX"),
      {
        keys: ["game:ABCD:deck:player-1"],
        arguments: ["movie-1"],
      },
    );
  });
});
