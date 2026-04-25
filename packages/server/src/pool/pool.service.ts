import {z} from "zod";
import {movieCandidateSchema, type MovieCandidate} from "@deckflix/shared";
import {NotFoundException} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";
import {
  normalizeGameCode,
  ROOM_TTL_SECONDS,
} from "../rooms/room-lifecycle.service";

export type PoolEntry = {
  movieId: string;
  order: number;
};

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

export type MovieMeta = z.infer<typeof movieCandidateSchema>;
export type MovieState = z.infer<typeof movieStateSchema>;
export type MovieRecord = {
  movie: MovieMeta;
} & MovieState;
export type MovieStatus = z.infer<typeof movieStatusSchema>;

const roomPrefix = (gameCode: string) => `game:${normalizeGameCode(gameCode)}:`;
const poolKey = (gameCode: string) => `${roomPrefix(gameCode)}pool`;
const moviesKey = (gameCode: string) => `${roomPrefix(gameCode)}movies`;
const movieStateKey = (gameCode: string) => `${roomPrefix(gameCode)}movie_state`;

const parseJson = <T>(raw: string, schema: z.ZodType<T>, label: string): T => {
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // handled below
  }

  throw new NotFoundException(label);
};

const normalizeMovieState = (
  state: Omit<MovieState, "resolvedAt" | "lastActivityAt" | "matchedAt"> &
    Partial<Pick<MovieState, "resolvedAt" | "lastActivityAt" | "matchedAt">>,
): MovieState => ({
  ...state,
  resolvedAt: state.resolvedAt ?? null,
  lastActivityAt: state.lastActivityAt ?? null,
  matchedAt: state.matchedAt ?? null,
});

export const createInitialMovieState = (): MovieState => ({
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

export const savePool = async (
  gameCode: string,
  movies: MovieCandidate[],
) => {
  await ensureRedis();
  const pool = poolKey(gameCode);
  const movieHash = moviesKey(gameCode);
  const stateHash = movieStateKey(gameCode);
  const multi = redis.multi();

  multi.del([pool, movieHash, stateHash]);
  if (movies.length > 0) {
    multi.rPush(pool, movies.map((movie) => movie.id));
    for (const movie of movies) {
      multi.hSet(movieHash, movie.id, JSON.stringify(movie));
      multi.hSet(
        stateHash,
        movie.id,
        JSON.stringify(createInitialMovieState()),
      );
    }
  }
  multi.expire(pool, ROOM_TTL_SECONDS);
  multi.expire(movieHash, ROOM_TTL_SECONDS);
  multi.expire(stateHash, ROOM_TTL_SECONDS);
  await multi.exec();
};

export const listPoolEntries = async (
  gameCode: string,
): Promise<PoolEntry[]> => {
  await ensureRedis();
  const movieIds = await redis.lRange(poolKey(gameCode), 0, -1);
  return movieIds.map((movieId, order) => ({movieId, order}));
};

export const listPoolMovieIds = async (gameCode: string) => {
  await ensureRedis();
  return redis.lRange(poolKey(gameCode), 0, -1);
};

export const getPoolSize = async (gameCode: string) => {
  await ensureRedis();
  return redis.lLen(poolKey(gameCode));
};

export const getMovieMetaOrThrow = async (
  gameCode: string,
  movieId: string,
): Promise<MovieMeta> => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const raw = await redis.hGet(moviesKey(normalized), movieId);
  if (!raw) {
    throw new NotFoundException(
      `Movie ${movieId} not found in game ${normalized}`,
    );
  }

  return parseJson(
    raw,
    movieCandidateSchema,
    `Movie ${movieId} not found in game ${normalized}`,
  );
};

export const getMovieMetas = async (gameCode: string, movieIds: string[]) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  if (movieIds.length === 0) {
    return new Map<string, MovieMeta>();
  }

  const raws = await redis.hmGet(moviesKey(normalized), movieIds);
  return new Map(
    movieIds.map((movieId, index) => {
      const raw = raws[index];
      if (!raw) {
        throw new NotFoundException(
          `Movie ${movieId} not found in game ${normalized}`,
        );
      }

      return [
        movieId,
        parseJson(
          raw,
          movieCandidateSchema,
          `Movie ${movieId} not found in game ${normalized}`,
        ),
      ] as const;
    }),
  );
};

export const getMovieStateOrThrow = async (
  gameCode: string,
  movieId: string,
): Promise<MovieState> => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const raw = await redis.hGet(movieStateKey(normalized), movieId);
  if (!raw) {
    throw new NotFoundException(
      `Movie ${movieId} not found in game ${normalized}`,
    );
  }

  return normalizeMovieState(
    parseJson(
      raw,
      movieStateSchema,
      `Movie ${movieId} not found in game ${normalized}`,
    ),
  );
};

export const getMovieStates = async (gameCode: string, movieIds: string[]) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  if (movieIds.length === 0) {
    return new Map<string, MovieState>();
  }

  const raws = await redis.hmGet(movieStateKey(normalized), movieIds);
  return new Map(
    movieIds.map((movieId, index) => {
      const raw = raws[index];
      if (!raw) {
        throw new NotFoundException(
          `Movie ${movieId} not found in game ${normalized}`,
        );
      }

      return [
        movieId,
        normalizeMovieState(
          parseJson(
            raw,
            movieStateSchema,
            `Movie ${movieId} not found in game ${normalized}`,
          ),
        ),
      ] as const;
    }),
  );
};

export const setMovieState = async (
  gameCode: string,
  movieId: string,
  state: MovieState,
) => {
  await ensureRedis();
  const key = movieStateKey(gameCode);
  await redis.hSet(key, movieId, JSON.stringify(state));
  await redis.expire(key, ROOM_TTL_SECONDS);
};

export const getMovieRecordOrThrow = async (
  gameCode: string,
  movieId: string,
): Promise<MovieRecord> => {
  const [movie, state] = await Promise.all([
    getMovieMetaOrThrow(gameCode, movieId),
    getMovieStateOrThrow(gameCode, movieId),
  ]);
  return {movie, ...state};
};

export const getMovieRecords = async (gameCode: string, movieIds: string[]) => {
  const [metas, states] = await Promise.all([
    getMovieMetas(gameCode, movieIds),
    getMovieStates(gameCode, movieIds),
  ]);
  return new Map(
    movieIds.map((movieId) => [
      movieId,
      {
        movie: metas.get(movieId)!,
        ...states.get(movieId)!,
      },
    ]),
  );
};
