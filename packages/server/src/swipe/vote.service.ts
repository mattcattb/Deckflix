import type {SwipeChoice} from "@deckflix/shared";
import {BadRequestException, NotFoundException} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";
import * as PoolService from "../pool/pool.service";
import {
  normalizeGameCode,
  ROOM_TTL_SECONDS,
} from "../rooms/room-lifecycle.service";
import * as RoomPlayersService from "../rooms/room-players.service";

export type VoteRecord = {
  playerId: string;
  movieId: string;
  choice: SwipeChoice;
  votedAt: string;
};

const swipeChoices = new Set<SwipeChoice>([
  "like",
  "dislike",
  "maybe",
  "super_like",
  "skip",
]);

const roomPrefix = (gameCode: string) => `game:${normalizeGameCode(gameCode)}:`;
const votesKey = (gameCode: string) => `${roomPrefix(gameCode)}votes`;
const movieStateKey = (gameCode: string) => `${roomPrefix(gameCode)}movie_state`;
const voteField = (playerId: string, movieId: string) =>
  `${playerId}:${movieId}`;

const parseVoteRecord = (
  field: string,
  raw: string,
): VoteRecord | null => {
  try {
    const parsed = JSON.parse(raw) as Partial<VoteRecord>;
    const [playerId, movieId] = field.split(":");
    return parsed.choice && swipeChoices.has(parsed.choice) && playerId && movieId
      ? {
          playerId,
          movieId,
          choice: parsed.choice,
          votedAt: parsed.votedAt ?? new Date(0).toISOString(),
        }
      : null;
  } catch {
    return null;
  }
};

export const recordVote = async (input: {
  gameCode: string;
  movieId: string;
  playerId: string;
  choice: SwipeChoice;
}) => {
  await ensureRedis();
  const votedAt = new Date().toISOString();
  const totalPlayers = (await RoomPlayersService.listPlayerIds(input.gameCode))
    .length;
  const result = await redis.eval(
    `
      local voteSet = redis.call("HSETNX", KEYS[1], ARGV[1], ARGV[2])
      if voteSet == 0 then
        return cjson.encode({status = "duplicate"})
      end

      local rawState = redis.call("HGET", KEYS[2], ARGV[3])
      if not rawState then
        return cjson.encode({status = "missing_movie"})
      end

      local state = cjson.decode(rawState)
      local previousStatus = state.status
      state.totalVotes = (state.totalVotes or 0) + 1
      state.lastActivityAt = ARGV[5]
      state.resolvedAt = state.resolvedAt or cjson.null
      state.matchedAt = state.matchedAt or cjson.null

      if ARGV[4] == "like" then
        state.likeCount = (state.likeCount or 0) + 1
      elseif ARGV[4] == "dislike" then
        state.dislikeCount = (state.dislikeCount or 0) + 1
      elseif ARGV[4] == "maybe" then
        state.maybeCount = (state.maybeCount or 0) + 1
      elseif ARGV[4] == "super_like" then
        state.superLikeCount = (state.superLikeCount or 0) + 1
      elseif ARGV[4] == "skip" then
        state.skipCount = (state.skipCount or 0) + 1
      end

      local positiveVotes = (state.likeCount or 0) + (state.superLikeCount or 0)
      local totalPlayers = tonumber(ARGV[6])
      local hasBlockingVote =
        (state.dislikeCount or 0) > 0 or
        (state.maybeCount or 0) > 0 or
        (state.skipCount or 0) > 0

      if totalPlayers > 0 and state.totalVotes == totalPlayers and positiveVotes == totalPlayers then
        state.status = "matched"
      elseif hasBlockingVote then
        state.status = "rejected"
      elseif totalPlayers > 0 and state.totalVotes == totalPlayers then
        state.status = "rejected"
      else
        state.status = "pending"
      end

      if state.status == "pending" then
        state.resolvedAt = cjson.null
        state.matchedAt = cjson.null
      else
        state.resolvedAt = state.resolvedAt == cjson.null and ARGV[5] or state.resolvedAt
        state.matchedAt = state.status == "matched" and (state.matchedAt == cjson.null and ARGV[5] or state.matchedAt) or cjson.null
      end

      redis.call("HSET", KEYS[2], ARGV[3], cjson.encode(state))
      redis.call("EXPIRE", KEYS[1], ARGV[7])
      redis.call("EXPIRE", KEYS[2], ARGV[7])

      return cjson.encode({
        status = "recorded",
        justMatched = previousStatus ~= "matched" and state.status == "matched",
        state = state
      })
    `,
    {
      keys: [votesKey(input.gameCode), movieStateKey(input.gameCode)],
      arguments: [
        voteField(input.playerId, input.movieId),
        JSON.stringify({
          choice: input.choice,
          votedAt,
        }),
        input.movieId,
        input.choice,
        votedAt,
        String(totalPlayers),
        String(ROOM_TTL_SECONDS),
      ],
    },
  );
  const parsed = JSON.parse(String(result)) as {
    status: "recorded" | "duplicate" | "missing_movie";
    justMatched?: boolean;
    state?: PoolService.MovieState;
  };

  if (parsed.status === "duplicate") {
    throw new BadRequestException("Vote already recorded for this movie");
  }
  if (parsed.status === "missing_movie" || !parsed.state) {
    throw new NotFoundException(
      `Movie ${input.movieId} not found in game ${normalizeGameCode(input.gameCode)}`,
    );
  }

  return {
    justMatched: Boolean(parsed.justMatched),
    state: parsed.state,
  };
};

export const getVoteRecords = async (gameCode: string) => {
  await ensureRedis();
  const rawVotes = await redis.hGetAll(votesKey(gameCode));
  return Object.entries(rawVotes)
    .map(([field, raw]) => parseVoteRecord(field, raw))
    .filter((record): record is VoteRecord => Boolean(record));
};

export const getMovieVoteRecords = async (gameCode: string, movieId: string) =>
  (await getVoteRecords(gameCode)).filter((record) => record.movieId === movieId);

export const getMovieVoteSummaries = async (
  gameCode: string,
  movieIds: string[],
) => {
  const voteRecords = await getVoteRecords(gameCode);
  return new Map(
    movieIds.map((movieId) => [
      movieId,
      voteRecords.filter((record) => record.movieId === movieId),
    ]),
  );
};
