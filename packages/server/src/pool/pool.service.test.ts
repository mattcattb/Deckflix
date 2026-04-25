import {beforeEach, describe, expect, mock, test} from "bun:test";

const ensureRedis = mock();
const multiDel = mock();
const multiRPush = mock();
const multiHSet = mock();
const multiExpire = mock();
const multiExec = mock();
const lRange = mock();
const lLen = mock();
const hGet = mock();
const hmGet = mock();

const multi = {
  del: multiDel,
  rPush: multiRPush,
  hSet: multiHSet,
  expire: multiExpire,
  exec: multiExec,
};

mock.module(new URL("../lib/redis.ts", import.meta.url).href, () => ({
  ensureRedis,
  redis: {
    multi: () => multi,
    lRange,
    lLen,
    hGet,
    hmGet,
  },
}));

const PoolService = await import(new URL("./pool.service.ts", import.meta.url).href);

const movie = {
  id: "movie-1",
  title: "Movie",
  year: 2026,
  overview: "Overview",
  posterUrl: "",
  rating: 7.1,
};

beforeEach(() => {
  ensureRedis.mockReset();
  multiDel.mockReset();
  multiRPush.mockReset();
  multiHSet.mockReset();
  multiExpire.mockReset();
  multiExec.mockReset();
  lRange.mockReset();
  lLen.mockReset();
  hGet.mockReset();
  hmGet.mockReset();

  for (const fn of [multiDel, multiRPush, multiHSet, multiExpire]) {
    fn.mockReturnValue(multi);
  }
});

describe("pool.service", () => {
  test("stores pool ids, movie metadata, and initial movie state", async () => {
    await PoolService.savePool("abcd", [movie]);

    expect(multiDel).toHaveBeenCalledWith([
      "game:ABCD:pool",
      "game:ABCD:movies",
      "game:ABCD:movie_state",
    ]);
    expect(multiRPush).toHaveBeenCalledWith("game:ABCD:pool", ["movie-1"]);
    expect(multiHSet).toHaveBeenCalledWith(
      "game:ABCD:movies",
      "movie-1",
      JSON.stringify(movie),
    );
    expect(multiHSet).toHaveBeenCalledWith(
      "game:ABCD:movie_state",
      "movie-1",
      expect.stringContaining("\"status\":\"pending\""),
    );
    expect(multiExec).toHaveBeenCalledTimes(1);
  });

  test("reads ordered pool entries and movie hash data", async () => {
    lRange.mockResolvedValue(["movie-1"]);
    lLen.mockResolvedValue(1);
    hGet.mockResolvedValue(JSON.stringify(movie));
    hmGet.mockResolvedValue([JSON.stringify(movie)]);

    await expect(PoolService.listPoolEntries("abcd")).resolves.toEqual([
      {movieId: "movie-1", order: 0},
    ]);
    await expect(PoolService.getPoolSize("abcd")).resolves.toBe(1);
    await expect(
      PoolService.getMovieMetaOrThrow("abcd", "movie-1"),
    ).resolves.toEqual(movie);
    await expect(PoolService.getMovieMetas("abcd", ["movie-1"])).resolves.toEqual(
      new Map([["movie-1", movie]]),
    );
  });
});
