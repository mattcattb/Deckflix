import type {SwipeChoice} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import {emitEvent} from "../common/app-events";
import {redisClient} from "../redis/redis";
import * as PoolService from "../pool/pool.service";
import * as MovieStateService from "./movie-state.service";
import * as PlayerService from "../players/player.service";
import {
  normalizeGameCode,
  ROOM_TTL_SECONDS,
  withRoomLock,
} from "../rooms/room-keys";
import {getVoteCountField, resolveMovieState} from "./match.service";

const roomPrefix = (gameCode: string) => `game:${normalizeGameCode(gameCode)}:`;
const votesKey = (gameCode: string, movieId: string) =>
  `${roomPrefix(gameCode)}votes:${movieId}`;

export const recordVote = async (input: {
  gameCode: string;
  movieId: string;
  playerId: string;
  choice: SwipeChoice;
}) => {
  const votedAt = new Date().toISOString();

  const voteSet = await redisClient.hSetNX(
    votesKey(input.gameCode, input.movieId),
    input.playerId,
    JSON.stringify({
      choice: input.choice,
      votedAt,
    }),
  );
  if (!voteSet) {
    throw new BadRequestException("Vote already recorded for this movie");
  }

  await redisClient.expire(
    votesKey(input.gameCode, input.movieId),
    ROOM_TTL_SECONDS,
  );

  const signalWeight = {
    dislike: -1.5,
    like: 2,
    maybe: 0.4,
    skip: -0.25,
    super_like: 3.5,
  }[input.choice];

  await Promise.all([
    MovieStateService.incrementMovieVoteState({
      gameCode: input.gameCode,
      movieId: input.movieId,
      countField: getVoteCountField(input.choice),
      votedAt,
    }),
    PoolService.addPoolSignal(
      input.gameCode,
      input.movieId,
      signalWeight,
    ),
  ]);

  return {
    votedAt,
  };
};

export const resolveVoteResult = async (input: {
  gameCode: string;
  movieId: string;
  votedAt: string;
}) => {
  return withRoomLock(input.gameCode, async () => {
    const [totalPlayers, previousState] = await Promise.all([
      PlayerService.countPlayers(input.gameCode),
      MovieStateService.getMovieStateOrThrow(input.gameCode, input.movieId),
    ]);

    const next = resolveMovieState({
      state: previousState,
      totalPlayers,
      votedAt: input.votedAt,
    });
    await MovieStateService.setMovieResolution(
      input.gameCode,
      input.movieId,
      next.state,
    );

    if (previousState.status !== "matched" && next.state.status === "matched") {
      emitEvent("game.match_found", {
        gameCode: normalizeGameCode(input.gameCode),
        movieId: input.movieId,
      });
    }

    return next;
  });
};
