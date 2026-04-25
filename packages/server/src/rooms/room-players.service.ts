import {z} from "zod";
import {NotFoundException} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";
import {
  normalizeGameCode,
  roomPrefix,
  ROOM_TTL_SECONDS,
} from "./room-lifecycle.service";

const playerRecordSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(40),
  joinedAt: z.string().datetime(),
  sessionToken: z.string().min(1),
});

export type PlayerRecord = z.infer<typeof playerRecordSchema>;

const playersKey = (gameCode: string) => `${roomPrefix(gameCode)}players`;

const parsePlayer = (raw: string, label: string) => {
  try {
    const parsed = playerRecordSchema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // handled below
  }

  throw new NotFoundException(label);
};

export const getPlayerRecord = async (
  gameCode: string,
  playerId: string,
) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const raw = await redis.hGet(playersKey(normalized), playerId);
  if (!raw) {
    return null;
  }

  return parsePlayer(raw, `Player ${playerId} not found in game ${normalized}`);
};

export const setPlayerRecord = async (
  gameCode: string,
  playerId: string,
  record: PlayerRecord,
) => {
  await ensureRedis();
  const key = playersKey(gameCode);
  await redis.hSet(key, playerId, JSON.stringify(record));
  await redis.expire(key, ROOM_TTL_SECONDS);
};

export const listPlayers = async (gameCode: string) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const raws = Object.values(await redis.hGetAll(playersKey(normalized)));
  return raws
    .map((raw) =>
      raw
        ? parsePlayer(raw, `Player data missing for game ${normalized}`)
        : null,
    )
    .filter((record): record is PlayerRecord => Boolean(record))
    .sort((left, right) => left.joinedAt.localeCompare(right.joinedAt));
};

export const listPlayerIds = async (gameCode: string) =>
  (await listPlayers(gameCode)).map((player) => player.id);

export const deletePlayerRecord = async (
  gameCode: string,
  playerId: string,
) => {
  await ensureRedis();
  await redis.hDel(playersKey(gameCode), playerId);
};
