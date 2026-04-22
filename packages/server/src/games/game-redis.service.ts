import {randomUUID} from "node:crypto";
import {z} from "zod";
import {
  movieCandidateSchema,
} from "@deckflix/shared";
import {BadRequestException, NotFoundException} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";

export const GAME_TTL_SECONDS = 60 * 60 * 24;
const GAME_LOCK_TTL_MS = 5_000;
const GAME_LOCK_RETRY_COUNT = 40;
const GAME_LOCK_RETRY_DELAY_MS = 50;

const movieStatusSchema = z.enum(["pending", "matched", "rejected"]);

const playerRecordSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(40),
  joinedAt: z.string().datetime(),
  sessionToken: z.string().min(1),
});

const movieRecordSchema = z.object({
  movie: movieCandidateSchema,
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

export type PlayerRecord = z.infer<typeof playerRecordSchema>;
export type MovieRecord = z.infer<typeof movieRecordSchema>;
export type MovieStatus = z.infer<typeof movieStatusSchema>;
export type RedisMulti = ReturnType<typeof redis.multi>;

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const parseJson = <T>(raw: string, schema: z.ZodType<T>, label: string): T => {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(raw);
  } catch {
    throw new NotFoundException(label);
  }

  const parsed = schema.safeParse(parsedValue);
  if (!parsed.success) {
    throw new NotFoundException(label);
  }

  return parsed.data;
};

export const normalizeGameCode = (gameCode: string) => gameCode.trim().toUpperCase();

const roomPrefix = (gameCode: string) => `game:${normalizeGameCode(gameCode)}:`;
const movieKey = (gameCode: string, movieId: string) => `${roomPrefix(gameCode)}movie:${movieId}`;
const playerKey = (gameCode: string, playerId: string) => `${roomPrefix(gameCode)}player:${playerId}`;
const gameLockKey = (gameCode: string) => `${roomPrefix(gameCode)}lock`;

const playerRecordPattern = (gameCode: string) => `${roomPrefix(gameCode)}player:*`;

const isPlayerRecordKey = (key: string) => key.split(":").length === 4;

const releaseGameLock = async (gameCode: string, token: string) => {
  await redis.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `,
    {
      keys: [gameLockKey(gameCode)],
      arguments: [token],
    },
  );
};

export const withGameLock = async <T>(
  gameCode: string,
  callback: () => Promise<T>,
) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const lockToken = randomUUID();

  for (let attempt = 0; attempt < GAME_LOCK_RETRY_COUNT; attempt += 1) {
    const locked = await redis.set(gameLockKey(normalized), lockToken, {
      NX: true,
      PX: GAME_LOCK_TTL_MS,
    });

    if (!locked) {
      await sleep(GAME_LOCK_RETRY_DELAY_MS);
      continue;
    }

    try {
      return await callback();
    } finally {
      await releaseGameLock(normalized, lockToken);
    }
  }

  throw new BadRequestException("Game is busy, please try again");
};

export const touchRoomKeys = async (gameCode: string) => {
  await ensureRedis();
  const keys = (await redis.keys(`${roomPrefix(gameCode)}*`))
    .filter((key) => key !== gameLockKey(gameCode));

  if (keys.length === 0) {
    return;
  }

  const multi = redis.multi();
  for (const key of keys) {
    multi.expire(key, GAME_TTL_SECONDS);
  }
  await multi.exec();
};

export const deleteRoomKeys = async (gameCode: string) => {
  await ensureRedis();
  const keys = await redis.keys(`${roomPrefix(gameCode)}*`);
  if (keys.length === 0) {
    return;
  }

  await redis.del(keys);
};

export const getMovieRecordOrThrow = async (gameCode: string, movieId: string) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const raw = await redis.get(movieKey(normalized, movieId));
  if (!raw) {
    throw new NotFoundException(`Movie ${movieId} not found in game ${normalized}`);
  }

  return parseJson(raw, movieRecordSchema, `Movie ${movieId} not found in game ${normalized}`);
};

export const getMovieRecords = async (gameCode: string, movieIds: string[]) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  if (movieIds.length === 0) {
    return new Map<string, MovieRecord>();
  }

  const raws = await redis.mGet(
    movieIds.map((movieId) => movieKey(normalized, movieId)),
  );
  const entries = movieIds.map((movieId, index) => {
    const raw = raws[index];
    if (!raw) {
      throw new NotFoundException(`Movie ${movieId} not found in game ${normalized}`);
    }

    return [
      movieId,
      parseJson(raw, movieRecordSchema, `Movie ${movieId} not found in game ${normalized}`),
    ] as const;
  });

  return new Map(entries);
};

export const setMovieRecord = async (
  gameCode: string,
  movieId: string,
  record: MovieRecord,
) => {
  await ensureRedis();
  await redis.set(movieKey(gameCode, movieId), JSON.stringify(record));
};

export const queueSetMovieRecord = (
  multi: RedisMulti,
  gameCode: string,
  movieId: string,
  record: MovieRecord,
) => multi.set(movieKey(gameCode, movieId), JSON.stringify(record));

export const getPlayerRecord = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  const raw = await redis.get(playerKey(gameCode, playerId));
  if (!raw) {
    return null;
  }

  return parseJson(
    raw,
    playerRecordSchema,
    `Player ${playerId} not found in game ${normalizeGameCode(gameCode)}`,
  );
};

export const setPlayerRecord = async (
  gameCode: string,
  playerId: string,
  record: PlayerRecord,
) => {
  await ensureRedis();
  await redis.set(playerKey(gameCode, playerId), JSON.stringify(record));
};

export const listPlayers = async (gameCode: string) => {
  await ensureRedis();
  const keys = (await redis.keys(playerRecordPattern(gameCode)))
    .filter(isPlayerRecordKey)
    .sort();

  const records = await Promise.all(
    keys.map(async (key) => {
      const raw = await redis.get(key);
      return raw
        ? parseJson(raw, playerRecordSchema, `Player data missing for ${key}`)
        : null;
    }),
  );

  return records
    .filter((record): record is PlayerRecord => Boolean(record))
    .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt));
};

export const listPlayerIds = async (gameCode: string) => {
  const players = await listPlayers(gameCode);
  return players.map((player) => player.id);
};

export const deletePlayerState = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  await redis.del(playerKey(gameCode, playerId));
};
