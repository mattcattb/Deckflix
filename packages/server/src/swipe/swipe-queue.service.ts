import {z} from "zod";
import {NotFoundException} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";
import {normalizeGameCode} from "../games/game-redis.service";

const playerQueueEntrySchema = z.object({
  movieId: z.string().min(1),
  order: z.number().int().min(0),
});

const playerCurrentAssignmentSchema = playerQueueEntrySchema.extend({
  assignmentId: z.string().min(1),
  issuedAt: z.string().datetime(),
});

export type PlayerQueueEntry = z.infer<typeof playerQueueEntrySchema>;
export type PlayerCurrentAssignment = z.infer<typeof playerCurrentAssignmentSchema>;

const playerQueueKey = (gameCode: string, playerId: string) =>
  `game:${normalizeGameCode(gameCode)}:player:${playerId}:queue`;
const playerCurrentKey = (gameCode: string, playerId: string) =>
  `game:${normalizeGameCode(gameCode)}:player:${playerId}:current`;
const playerSeenKey = (gameCode: string, playerId: string) =>
  `game:${normalizeGameCode(gameCode)}:player:${playerId}:seen`;

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

export const deleteSwipeState = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  await redis.del([
    playerQueueKey(gameCode, playerId),
    playerCurrentKey(gameCode, playerId),
    playerSeenKey(gameCode, playerId),
  ]);
};
