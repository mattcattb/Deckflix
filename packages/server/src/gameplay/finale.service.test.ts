import {afterEach, describe, expect, test} from "bun:test";
import * as MovieMetadataService from "../movies/movie-metadata.service";
import {redisClient} from "../redis/redis";
import {playersKey, roomPrefix} from "../rooms/room-keys";
import * as MovieStateService from "./movie-state.service";
import * as PoolService from "../pool/pool.service";
import * as FinaleService from "./finale.service";

const gameCode = "FIN1";

afterEach(async () => {
  const keys = await redisClient.keys(`${roomPrefix(gameCode)}*`);
  if (keys.length) await redisClient.del(keys);
});

describe("finale service", () => {
  test("selects exposed candidates and completes a private final vote", async () => {
    const movies = ["1", "2", "3"].map((id) => ({
      id,
      title: `Movie ${id}`,
      year: 2026,
      overview: "",
      posterUrl: "",
      rating: 7,
    }));
    await redisClient.hSet(
      playersKey(gameCode),
      Object.fromEntries(
        ["p1", "p2", "p3"].map((id) => [id, JSON.stringify({id})]),
      ),
    );
    await PoolService.replacePool(gameCode, movies.map((movie) => movie.id));
    await MovieMetadataService.replaceRoomMovieMetadata(gameCode, movies);
    await MovieStateService.initializeMovieStates(gameCode, movies.map((movie) => movie.id));
    for (const movieId of ["1", "2", "3"]) {
      for (let index = 0; index < 2; index += 1) {
        await MovieStateService.incrementMovieVoteState({
          gameCode,
          movieId,
          countField: movieId === "3" ? "maybeCount" : "likeCount",
          votedAt: new Date().toISOString(),
        });
      }
    }

    await expect(FinaleService.createFinale(gameCode)).resolves.toEqual(["1", "2", "3"]);
    await FinaleService.recordFinaleVote({gameCode, playerId: "p1", movieId: "2"});
    await FinaleService.recordFinaleVote({gameCode, playerId: "p2", movieId: "2"});
    const result = await FinaleService.recordFinaleVote({
      gameCode,
      playerId: "p3",
      movieId: "1",
    });

    expect(result.completed).toBe(true);
    expect(result.winner?.id).toBe("2");
    expect(result.voteCounts).toEqual({"1": 1, "2": 2, "3": 0});
  });
});
