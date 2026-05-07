import {z} from "zod";
import {NotFoundException} from "../common/errors";
import {ensureRedis, redisClient} from "../redis/redis";
import * as RoomsService from "../rooms/rooms.service";

const movieStatusSchema = z.enum(["pending", "matched", "rejected"]);
const movieStateSchema = z.object({
  status: movieStatusSchema,
  likeCount: z.number().int().min(0),
  dislikeCount: z.number().int().min(0),
  maybeCount: z.number().int().min(0),
  superLikeCount: z.number().int().min(0),
  skipCount: z.number().int().min(0),
  totalVotes: z.number().int().min(0),
  resolvedAt: z.string().datetime().nullable().default(null),
  lastActivityAt: z.string().datetime().nullable().default(null),
  matchedAt: z.string().datetime().nullable().default(null),
});

export type MovieState = z.infer<typeof movieStateSchema>;

const roomPrefix = (gameCode: string) =>
  `game:${RoomsService.normalizeGameCode(gameCode)}:`;
const movieStateKey = (gameCode: string, movieId: string) =>
  `${roomPrefix(gameCode)}movie_state:${movieId}`;

const voteCountFields = [
  "likeCount",
  "dislikeCount",
  "maybeCount",
  "superLikeCount",
  "skipCount",
] as const;

const createInitialMovieState = (): MovieState => ({
  status: "pending",
  likeCount: 0,
  dislikeCount: 0,
  maybeCount: 0,
  superLikeCount: 0,
  skipCount: 0,
  totalVotes: 0,
  resolvedAt: null,
  lastActivityAt: null,
  matchedAt: null,
});

const parseCount = (raw: string | undefined) => {
  const parsed = Number.parseInt(raw ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parseNullableDate = (raw: string | undefined) => raw || null;

const parseMovieState = (
  raw: Record<string, string>,
  gameCode: string,
  movieId: string,
): MovieState => {
  if (!raw.status) {
    throw new NotFoundException(
      `Movie ${movieId} not found in game ${RoomsService.normalizeGameCode(gameCode)}`,
    );
  }

  return movieStateSchema.parse({
    status: raw.status,
    likeCount: parseCount(raw.likeCount),
    dislikeCount: parseCount(raw.dislikeCount),
    maybeCount: parseCount(raw.maybeCount),
    superLikeCount: parseCount(raw.superLikeCount),
    skipCount: parseCount(raw.skipCount),
    totalVotes: parseCount(raw.totalVotes),
    resolvedAt: parseNullableDate(raw.resolvedAt),
    lastActivityAt: parseNullableDate(raw.lastActivityAt),
    matchedAt: parseNullableDate(raw.matchedAt),
  });
};

const queueSetMovieState = (
  multi: ReturnType<typeof redisClient.multi>,
  gameCode: string,
  movieId: string,
  state: MovieState,
) => {
  const key = movieStateKey(gameCode, movieId);
  multi.hSet(key, {
    status: state.status,
    likeCount: String(state.likeCount),
    dislikeCount: String(state.dislikeCount),
    maybeCount: String(state.maybeCount),
    superLikeCount: String(state.superLikeCount),
    skipCount: String(state.skipCount),
    totalVotes: String(state.totalVotes),
    resolvedAt: state.resolvedAt ?? "",
    lastActivityAt: state.lastActivityAt ?? "",
    matchedAt: state.matchedAt ?? "",
  });
  multi.expire(key, RoomsService.ROOM_TTL_SECONDS);
};

export const initializeMovieStates = async (
  gameCode: string,
  movieIds: string[],
) => {
  await ensureRedis();
  const initialState = createInitialMovieState();
  const multi = redisClient.multi();

  for (const movieId of movieIds) {
    queueSetMovieState(multi, gameCode, movieId, initialState);
  }

  await multi.exec();
};

export const getMovieStateOrThrow = async (
  gameCode: string,
  movieId: string,
) => {
  await ensureRedis();
  return parseMovieState(
    await redisClient.hGetAll(movieStateKey(gameCode, movieId)),
    gameCode,
    movieId,
  );
};

export const getMovieStates = async (gameCode: string, movieIds: string[]) => {
  await ensureRedis();
  const entries = await Promise.all(
    movieIds.map(
      async (movieId) =>
        [
          movieId,
          parseMovieState(
            await redisClient.hGetAll(movieStateKey(gameCode, movieId)),
            gameCode,
            movieId,
          ),
        ] as const,
    ),
  );

  return new Map(entries);
};

export const incrementMovieVoteState = async (input: {
  gameCode: string;
  movieId: string;
  countField: (typeof voteCountFields)[number];
  votedAt: string;
}) => {
  await ensureRedis();
  const key = movieStateKey(input.gameCode, input.movieId);
  const multi = redisClient.multi();
  multi.hIncrBy(key, input.countField, 1);
  multi.hIncrBy(key, "totalVotes", 1);
  multi.hSet(key, "lastActivityAt", input.votedAt);
  multi.expire(key, RoomsService.ROOM_TTL_SECONDS);
  await multi.exec();
};

export const setMovieResolution = async (
  gameCode: string,
  movieId: string,
  state: Pick<MovieState, "status" | "resolvedAt" | "matchedAt">,
) => {
  await ensureRedis();
  const key = movieStateKey(gameCode, movieId);
  await redisClient
    .multi()
    .hSet(key, {
      status: state.status,
      resolvedAt: state.resolvedAt ?? "",
      matchedAt: state.matchedAt ?? "",
    })
    .expire(key, RoomsService.ROOM_TTL_SECONDS)
    .exec();
};
