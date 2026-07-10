import type {FinaleState} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import * as MovieMetadataService from "../movies/movie-metadata.service";
import * as PlayerService from "../players/player.service";
import * as PoolService from "../pool/pool.service";
import {redisClient} from "../redis/redis";
import {roomPrefix, ROOM_TTL_SECONDS} from "../rooms/room-keys";
import * as MovieStateService from "./movie-state.service";

const finalistsKey = (gameCode: string) => `${roomPrefix(gameCode)}finalists`;
const finaleVotesKey = (gameCode: string) => `${roomPrefix(gameCode)}finale_votes`;
const finaleWinnerKey = (gameCode: string) => `${roomPrefix(gameCode)}finale_winner`;

export const createFinale = async (gameCode: string) => {
  const [entries, totalPlayers] = await Promise.all([
    PoolService.listPoolEntries(gameCode),
    PlayerService.countPlayers(gameCode),
  ]);
  const states = await MovieStateService.getMovieStates(
    gameCode,
    entries.map((entry) => entry.movieId),
  );
  const minimumExposure = totalPlayers <= 2 ? totalPlayers : Math.ceil(totalPlayers * 0.6);
  const ranked = entries
    .map((entry) => ({entry, state: states.get(entry.movieId)!}))
    .filter(({state}) => state.totalVotes >= minimumExposure && state.status !== "rejected")
    .sort((left, right) => {
      const score = (state: MovieStateService.MovieState) =>
        state.likeCount + state.superLikeCount * 1.5 + state.maybeCount * 0.25 -
        state.dislikeCount * 1.2 - state.skipCount * 0.2;
      return score(right.state) - score(left.state) || right.state.totalVotes - left.state.totalVotes;
    })
    .slice(0, 3);

  if (ranked.length < 2) {
    throw new BadRequestException("Keep swiping until at least two strong picks emerge");
  }

  const movieIds = ranked.map(({entry}) => entry.movieId);
  const key = finalistsKey(gameCode);
  const multi = redisClient.multi();
  multi.del([key, finaleVotesKey(gameCode), finaleWinnerKey(gameCode)]);
  multi.rPush(key, movieIds);
  multi.expire(key, ROOM_TTL_SECONDS);
  await multi.exec();
  return movieIds;
};

export const getFinaleState = async (
  gameCode: string,
  playerId?: string,
): Promise<FinaleState> => {
  const [movieIds, votes, totalPlayers, winnerId] = await Promise.all([
    redisClient.lRange(finalistsKey(gameCode), 0, -1),
    redisClient.hGetAll(finaleVotesKey(gameCode)),
    PlayerService.countPlayers(gameCode),
    redisClient.get(finaleWinnerKey(gameCode)),
  ]);
  const movies = movieIds.length
    ? await MovieMetadataService.getRoomMovieMetadataMap(gameCode, movieIds)
    : new Map();
  const voteCounts = Object.fromEntries(movieIds.map((movieId) => [movieId, 0]));
  for (const movieId of Object.values(votes)) {
    if (movieId && movieId in voteCounts) voteCounts[movieId] += 1;
  }
  return {
    finalists: movieIds.map((movieId) => movies.get(movieId)!),
    voteCounts,
    totalVotes: Object.keys(votes).length,
    totalPlayers,
    myVote: playerId ? votes[playerId] || null : undefined,
    winner: winnerId && winnerId !== "none" ? movies.get(winnerId) ?? null : null,
    completed: Boolean(winnerId),
  };
};

export const recordFinaleVote = async (input: {
  gameCode: string;
  playerId: string;
  movieId: string | null;
}) => {
  const finalists = await redisClient.lRange(finalistsKey(input.gameCode), 0, -1);
  if (finalists.length === 0 || (input.movieId && !finalists.includes(input.movieId))) {
    throw new BadRequestException("Invalid finalist");
  }
  const key = finaleVotesKey(input.gameCode);
  await redisClient
    .multi()
    .hSet(key, input.playerId, input.movieId ?? "")
    .expire(key, ROOM_TTL_SECONDS)
    .exec();

  const state = await getFinaleState(input.gameCode, input.playerId);
  if (state.totalPlayers > 0 && state.totalVotes >= state.totalPlayers) {
    const noneCount = state.totalVotes - Object.values(state.voteCounts).reduce((sum, count) => sum + count, 0);
    const winner = state.finalists
      .map((movie) => ({movie, votes: state.voteCounts[movie.id] ?? 0}))
      .sort((left, right) => right.votes - left.votes)[0];
    await redisClient.set(
      finaleWinnerKey(input.gameCode),
      winner && winner.votes > noneCount && winner.votes > 0
        ? winner.movie.id
        : "none",
      {
        EX: ROOM_TTL_SECONDS,
      },
    );
  }
  return getFinaleState(input.gameCode, input.playerId);
};
