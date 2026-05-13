import {afterEach, describe, expect, test} from "bun:test";
import {redisClient} from "../redis/redis";
import {roomPrefix} from "../rooms/room-keys";
import * as MovieMetadataService from "./movie-metadata.service";

const gameCode = "MMT1";
const moviesKey = `${roomPrefix(gameCode)}movies`;
const movie = {
  id: "movie-1",
  title: "One",
  year: 2026,
  overview: "",
  posterUrl: "",
  rating: 7,
};

afterEach(async () => {
  await redisClient.del(moviesKey);
});

describe("movie-metadata.service", () => {
  test("replaces and reads room movie metadata", async () => {
    await MovieMetadataService.replaceRoomMovieMetadata(gameCode, [movie]);

    await expect(
      MovieMetadataService.getRoomMovieMetadataOrThrow(gameCode, movie.id),
    ).resolves.toEqual(movie);
    await expect(
      MovieMetadataService.getRoomMovieMetadataMap(gameCode, [movie.id]),
    ).resolves.toEqual(new Map([[movie.id, movie]]));
  });

  test("upserts room movie metadata", async () => {
    await MovieMetadataService.upsertRoomMovieMetadata(gameCode, [movie]);

    await expect(
      MovieMetadataService.getRoomMovieMetadataOrThrow(gameCode, movie.id),
    ).resolves.toEqual(movie);
  });

  test("throws when metadata is missing", async () => {
    await expect(
      MovieMetadataService.getRoomMovieMetadataOrThrow(gameCode, "missing"),
    ).rejects.toThrow("Movie missing not found in game MMT1");
  });
});
