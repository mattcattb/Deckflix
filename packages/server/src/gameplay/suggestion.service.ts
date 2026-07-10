import {BadRequestException, ConflictException} from "../common/errors";
import {toMovieCandidateFromTmdb} from "../movies/movie-normalizer";
import * as MovieMetadataService from "../movies/movie-metadata.service";
import {getTmdbMovieDetails} from "../movies/tmdb.service";
import * as PlayerService from "../players/player.service";
import * as PoolService from "../pool/pool.service";
import {redisClient} from "../redis/redis";
import {roomPrefix, ROOM_TTL_SECONDS, withRoomLock} from "../rooms/room-keys";
import * as MovieStateService from "./movie-state.service";
import {randomUUID} from "node:crypto";

const suggestionsKey = (gameCode: string) =>
  `${roomPrefix(gameCode)}player_suggestions`;
const notificationsKey = (gameCode: string, playerId: string) =>
  `${roomPrefix(gameCode)}notifications:${playerId}`;

export const getSuggestionRemaining = async (
  gameCode: string,
  playerId: string,
) => (await redisClient.hExists(suggestionsKey(gameCode), playerId)) ? 0 : 1;

export const suggestMovie = async (input: {
  gameCode: string;
  playerId: string;
  movieId: string;
}) => {
  const [details, player] = await Promise.all([
    getTmdbMovieDetails(input.movieId),
    PlayerService.getPlayerRecord(input.gameCode, input.playerId),
  ]);
  if (!player) {
    throw new BadRequestException("Player not found");
  }
  const movie = toMovieCandidateFromTmdb(details);

  await withRoomLock(input.gameCode, async () => {
    if (!(await getSuggestionRemaining(input.gameCode, input.playerId))) {
      throw new ConflictException("Your suggestion slot has already been used");
    }

    const appended = await PoolService.appendPoolMovieIds(input.gameCode, [movie.id]);
    if (appended.length === 0) {
      throw new ConflictException("That movie is already in this room");
    }

    const key = suggestionsKey(input.gameCode);
    await redisClient
      .multi()
      .hSet(key, input.playerId, movie.id)
      .expire(key, ROOM_TTL_SECONDS)
      .exec();
  });

  await Promise.all([
    MovieMetadataService.upsertRoomMovieMetadata(input.gameCode, [movie]),
    MovieStateService.initializeMissingMovieStates(input.gameCode, [movie.id]),
    PoolService.setPoolSource(input.gameCode, movie.id, {
      source: "suggestion",
      suggestedByPlayerId: input.playerId,
      suggestedByName: player.displayName,
    }),
  ]);

  return {movie, suggestionRemaining: 0};
};

export const notifySuggestionLiked = async (input: {
  gameCode: string;
  suggestedByPlayerId: string;
  movieTitle: string;
}) => {
  const key = notificationsKey(input.gameCode, input.suggestedByPlayerId);
  const notification = {
    id: randomUUID(),
    title: "Someone liked your suggestion",
    message: `${input.movieTitle} is heating up.`,
    createdAt: new Date().toISOString(),
  };
  await redisClient
    .multi()
    .lPush(key, JSON.stringify(notification))
    .lTrim(key, 0, 9)
    .expire(key, ROOM_TTL_SECONDS)
    .exec();
  return notification;
};

export const listPlayerNotifications = async (
  gameCode: string,
  playerId: string,
) => ({
  items: (await redisClient.lRange(notificationsKey(gameCode, playerId), 0, 9)).map(
    (value) => JSON.parse(value) as {
      id: string;
      title: string;
      message: string;
      createdAt: string;
    },
  ),
});
