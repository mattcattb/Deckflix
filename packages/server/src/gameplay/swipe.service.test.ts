import {afterEach, beforeEach, describe, expect, test} from "bun:test";
import * as MovieMetadataService from "../movies/movie-metadata.service";
import * as PoolService from "../pool/pool.service";
import {redisClient} from "../redis/redis";
import {roomPrefix} from "../rooms/room-keys";
import * as RoomsService from "../rooms/rooms.service";
import * as DeckService from "./deck.service";
import * as GameService from "./game.service";
import * as MovieStateService from "./movie-state.service";

let gameCode: string;
const playerId = "player-1";

beforeEach(async () => {
  gameCode = (await RoomsService.create({})).gameCode;
});

afterEach(async () => {
  const keys = await redisClient.keys(`${roomPrefix(gameCode)}*`);
  if (keys.length) await redisClient.del(keys);
});

const arrangeDeck = async (size: number) => {
  const movies = Array.from({length: size}, (_, index) => ({
    id: `movie-${index + 1}`,
    title: `Movie ${index + 1}`,
    year: 2026,
    overview: "",
    posterUrl: "",
    rating: 7,
  }));
  const movieIds = movies.map((movie) => movie.id);
  await Promise.all([
    PoolService.replacePool(gameCode, movieIds),
    MovieMetadataService.replaceRoomMovieMetadata(gameCode, movies),
    MovieStateService.initializeMovieStates(gameCode, movieIds),
  ]);
  await DeckService.refreshPlayerDeck(gameCode, playerId);
  return DeckService.peekCurrentMovieId(gameCode, playerId);
};

describe("swipe service", () => {
  test("rejects stale client movie ids without advancing or voting", async () => {
    const currentMovieId = await arrangeDeck(3);

    await expect(
      GameService.recordSwipe({
        gameCode,
        playerId,
        movieId: "not-the-current-movie",
        choice: "like",
      }),
    ).rejects.toThrow("Vote does not match the deck head");

    expect(await DeckService.peekCurrentMovieId(gameCode, playerId)).toBe(
      currentMovieId,
    );
    expect((await MovieStateService.getMovieStateOrThrow(gameCode, currentMovieId!)).totalVotes).toBe(0);
  });

  test("returns a completed state after voting on the final movie", async () => {
    const currentMovieId = await arrangeDeck(1);

    await expect(
      GameService.recordSwipe({
        gameCode,
        playerId,
        movieId: currentMovieId!,
        choice: "like",
      }),
    ).resolves.toMatchObject({
      movieId: currentMovieId,
      statePatch: {
        currentItem: null,
        remainingCount: 0,
        me: {completed: true},
      },
    });
  });

  test("tops up the player deck as part of a successful swipe", async () => {
    const currentMovieId = await arrangeDeck(4);

    const result = await GameService.recordSwipe({
      gameCode,
      playerId,
      movieId: currentMovieId!,
      choice: "like",
    });

    expect(result.statePatch.currentItem?.movie.id).not.toBe(currentMovieId);
    expect(result.statePatch.remainingCount).toBe(3);
  });

  test("returns the cached result when a swipe action is retried", async () => {
    const currentMovieId = await arrangeDeck(2);
    const input = {
      gameCode,
      playerId,
      movieId: currentMovieId!,
      choice: "like" as const,
      actionId: "171bb596-6e9f-4539-a91f-ef35ec304e17",
    };

    const first = await GameService.recordSwipe(input);
    const second = await GameService.recordSwipe(input);

    expect(second).toEqual(first);
    expect(
      (await MovieStateService.getMovieStateOrThrow(gameCode, currentMovieId!))
        .totalVotes,
    ).toBe(1);
  });

  test("coalesces concurrent retries of the same swipe action", async () => {
    const currentMovieId = await arrangeDeck(2);
    const input = {
      gameCode,
      playerId,
      movieId: currentMovieId!,
      choice: "like" as const,
      actionId: "9ca3b621-88c8-459d-a147-bf4fa7cf4dba",
    };

    const [first, second] = await Promise.all([
      GameService.recordSwipe(input),
      GameService.recordSwipe(input),
    ]);

    expect(second).toEqual(first);
    expect(
      (await MovieStateService.getMovieStateOrThrow(gameCode, currentMovieId!))
        .totalVotes,
    ).toBe(1);
  });
});
