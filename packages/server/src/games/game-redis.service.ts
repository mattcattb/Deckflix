import {randomUUID} from "node:crypto";
import {z} from "zod";
import {
  gameSettingsSchema,
  gameStatusSchema,
  movieCandidateSchema,
  type GameSettings,
  type MovieCandidate,
  type SwipeChoice,
} from "@deckflix/shared";
import {BadRequestException, NotFoundException} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";

const GAME_TTL_SECONDS = 60 * 60 * 24;
const GAME_LOCK_TTL_MS = 5_000;
const GAME_LOCK_RETRY_COUNT = 40;
const GAME_LOCK_RETRY_DELAY_MS = 50;

const movieStatusSchema = z.enum(["pending", "matched", "rejected"]);

const displayRecordSchema = z.object({
  id: z.string().min(1),
  sessionToken: z.string().min(1),
});

const gameMetaRecordSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  roomName: z.string().min(1).max(60).nullable(),
  status: gameStatusSchema,
  createdAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  display: displayRecordSchema,
});

const playerRecordSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(40),
  joinedAt: z.string().datetime(),
  sessionToken: z.string().min(1),
});

const playerQueueEntrySchema = z.object({
  movieId: z.string().min(1),
  order: z.number().int().min(0),
});

const playerCurrentAssignmentSchema = playerQueueEntrySchema.extend({
  assignmentId: z.string().min(1),
  issuedAt: z.string().datetime(),
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
});

export type GameMetaRecord = z.infer<typeof gameMetaRecordSchema>;
export type DisplayRecord = z.infer<typeof displayRecordSchema>;
export type PlayerRecord = z.infer<typeof playerRecordSchema>;
export type PlayerQueueEntry = z.infer<typeof playerQueueEntrySchema>;
export type PlayerCurrentAssignment = z.infer<typeof playerCurrentAssignmentSchema>;
export type MovieRecord = z.infer<typeof movieRecordSchema>;
export type MovieStatus = z.infer<typeof movieStatusSchema>;

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
const metaKey = (gameCode: string) => `${roomPrefix(gameCode)}meta`;
const settingsKey = (gameCode: string) => `${roomPrefix(gameCode)}settings`;
const poolKey = (gameCode: string) => `${roomPrefix(gameCode)}pool`;
const movieKey = (gameCode: string, movieId: string) => `${roomPrefix(gameCode)}movie:${movieId}`;
const votesKey = (gameCode: string, movieId: string) => `${roomPrefix(gameCode)}votes:${movieId}`;
const matchesKey = (gameCode: string) => `${roomPrefix(gameCode)}matches`;
const rejectionsKey = (gameCode: string) => `${roomPrefix(gameCode)}rejections`;
const playerKey = (gameCode: string, playerId: string) => `${roomPrefix(gameCode)}player:${playerId}`;
const playerQueueKey = (gameCode: string, playerId: string) => `${roomPrefix(gameCode)}player:${playerId}:queue`;
const playerCurrentKey = (gameCode: string, playerId: string) => `${roomPrefix(gameCode)}player:${playerId}:current`;
const playerSeenKey = (gameCode: string, playerId: string) => `${roomPrefix(gameCode)}player:${playerId}:seen`;
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

export const createGameState = async (input: {
  meta: GameMetaRecord;
  settings: GameSettings;
  movies: MovieCandidate[];
}) => {
  await ensureRedis();
  const normalized = normalizeGameCode(input.meta.code);
  const created = await redis.set(metaKey(normalized), JSON.stringify({
    ...input.meta,
    code: normalized,
  }), {
    NX: true,
    EX: GAME_TTL_SECONDS,
  });

  if (!created) {
    return false;
  }

  await redis.set(settingsKey(normalized), JSON.stringify(input.settings), {
    EX: GAME_TTL_SECONDS,
  });

  if (input.movies.length > 0) {
    await redis.zAdd(
      poolKey(normalized),
      input.movies.map((movie, order) => ({
        value: movie.id,
        score: order,
      })),
    );

    for (const movie of input.movies) {
      const record: MovieRecord = {
        movie,
        status: "pending",
        likeCount: 0,
        dislikeCount: 0,
        maybeCount: 0,
        superLikeCount: 0,
        skipCount: 0,
        totalVotes: 0,
      };
      await redis.set(movieKey(normalized, movie.id), JSON.stringify(record));
    }
  }

  await touchRoomKeys(normalized);
  return true;
};

export const getGameMetaOrThrow = async (gameCode: string) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const raw = await redis.get(metaKey(normalized));
  if (!raw) {
    throw new NotFoundException(`Game ${normalized} not found`);
  }

  return parseJson(raw, gameMetaRecordSchema, `Game ${normalized} not found`);
};

export const setGameMeta = async (gameCode: string, meta: GameMetaRecord) => {
  await ensureRedis();
  await redis.set(metaKey(gameCode), JSON.stringify(meta));
};

export const getGameSettingsOrThrow = async (gameCode: string) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const raw = await redis.get(settingsKey(normalized));
  if (!raw) {
    throw new NotFoundException(`Game ${normalized} not found`);
  }

  return parseJson(raw, gameSettingsSchema, `Game ${normalized} not found`);
};

export const getPoolEntries = async (gameCode: string): Promise<PlayerQueueEntry[]> => {
  await ensureRedis();
  const movieIds = await redis.zRange(poolKey(gameCode), 0, -1);
  return movieIds.map((movieId, order) => ({
    movieId,
    order,
  }));
};

export const getPoolSize = async (gameCode: string) => {
  await ensureRedis();
  return redis.zCard(poolKey(gameCode));
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
  const entries = await Promise.all(
    movieIds.map(async (movieId) => {
      const record = await getMovieRecordOrThrow(gameCode, movieId);
      return [movieId, record] as const;
    }),
  );

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

export const syncMovieOutcomeSets = async (
  gameCode: string,
  movieId: string,
  status: MovieStatus,
) => {
  await ensureRedis();

  if (status === "matched") {
    await redis.sAdd(matchesKey(gameCode), movieId);
    await redis.sRem(rejectionsKey(gameCode), movieId);
    return;
  }

  if (status === "rejected") {
    await redis.sAdd(rejectionsKey(gameCode), movieId);
    await redis.sRem(matchesKey(gameCode), movieId);
    return;
  }

  await redis.sRem(matchesKey(gameCode), movieId);
  await redis.sRem(rejectionsKey(gameCode), movieId);
};

export const getMatchedMovieIds = async (gameCode: string) => {
  await ensureRedis();
  return redis.sMembers(matchesKey(gameCode));
};

export const getRejectedMovieIds = async (gameCode: string) => {
  await ensureRedis();
  return redis.sMembers(rejectionsKey(gameCode));
};

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
  await redis.del([
    playerKey(gameCode, playerId),
    playerQueueKey(gameCode, playerId),
    playerCurrentKey(gameCode, playerId),
    playerSeenKey(gameCode, playerId),
  ]);
};

export const getPlayerQueueEntries = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  const rawEntries = await redis.lRange(playerQueueKey(gameCode, playerId), 0, -1);
  return rawEntries.map((raw) =>
    parseJson(raw, playerQueueEntrySchema, `Invalid player queue for ${playerId}`),
  );
};

export const getPlayerQueueLength = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  return redis.lLen(playerQueueKey(gameCode, playerId));
};

export const pushPlayerQueueEntries = async (
  gameCode: string,
  playerId: string,
  entries: PlayerQueueEntry[],
) => {
  if (entries.length === 0) {
    return;
  }

  await ensureRedis();
  await redis.rPush(
    playerQueueKey(gameCode, playerId),
    entries.map((entry) => JSON.stringify(entry)),
  );
};

export const popPlayerQueueEntry = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  const raw = await redis.lPop(playerQueueKey(gameCode, playerId));
  if (!raw) {
    return null;
  }

  return parseJson(raw, playerQueueEntrySchema, `Invalid player queue for ${playerId}`);
};

export const clearPlayerQueue = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  await redis.del(playerQueueKey(gameCode, playerId));
};

export const getPlayerCurrentAssignment = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  const raw = await redis.get(playerCurrentKey(gameCode, playerId));
  if (!raw) {
    return null;
  }

  return parseJson(
    raw,
    playerCurrentAssignmentSchema,
    `Invalid player assignment for ${playerId}`,
  );
};

export const setPlayerCurrentAssignment = async (
  gameCode: string,
  playerId: string,
  assignment: PlayerCurrentAssignment,
) => {
  await ensureRedis();
  await redis.set(playerCurrentKey(gameCode, playerId), JSON.stringify(assignment));
};

export const clearPlayerCurrentAssignment = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  await redis.del(playerCurrentKey(gameCode, playerId));
};

export const getPlayerSeenMovieIds = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  return redis.sMembers(playerSeenKey(gameCode, playerId));
};

export const getPlayerSeenCount = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  return redis.sCard(playerSeenKey(gameCode, playerId));
};

export const markPlayerSeenMovie = async (
  gameCode: string,
  playerId: string,
  movieId: string,
) => {
  await ensureRedis();
  await redis.sAdd(playerSeenKey(gameCode, playerId), movieId);
};

export const hasPlayerSeenMovie = async (
  gameCode: string,
  playerId: string,
  movieId: string,
) => {
  await ensureRedis();
  return redis.sIsMember(playerSeenKey(gameCode, playerId), movieId);
};

export const getPlayerVote = async (
  gameCode: string,
  movieId: string,
  playerId: string,
) => {
  await ensureRedis();
  return redis.hGet(votesKey(gameCode, movieId), playerId);
};

export const setPlayerVote = async (
  gameCode: string,
  movieId: string,
  playerId: string,
  choice: SwipeChoice,
) => {
  await ensureRedis();
  await redis.hSet(votesKey(gameCode, movieId), playerId, choice);
};
