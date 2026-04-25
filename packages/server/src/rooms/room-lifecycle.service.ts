import {ensureRedis, redis} from "../lib/redis";
import {withRedisLock} from "../lib/redis-lock";

export const ROOM_TTL_SECONDS = 60 * 60 * 24;
const ROOM_LOCK_TTL_MS = 5_000;
const ROOM_LOCK_RETRY_COUNT = 40;
const ROOM_LOCK_RETRY_DELAY_MS = 50;

export const normalizeGameCode = (gameCode: string) =>
  gameCode.trim().toUpperCase();

export const roomPrefix = (gameCode: string) =>
  `game:${normalizeGameCode(gameCode)}:`;

export const roomKey = (gameCode: string) => `${roomPrefix(gameCode)}room`;

const roomLockKey = (gameCode: string) => `${roomPrefix(gameCode)}lock`;

export const withRoomLock = async <T>(
  gameCode: string,
  callback: () => Promise<T>,
) =>
  withRedisLock(
    {
      key: roomLockKey(gameCode),
      ttlMs: ROOM_LOCK_TTL_MS,
      retryCount: ROOM_LOCK_RETRY_COUNT,
      retryDelayMs: ROOM_LOCK_RETRY_DELAY_MS,
      busyMessage: "Game is busy, please try again",
    },
    callback,
  );

export const deleteRoomKeys = async (gameCode: string) => {
  await ensureRedis();
  const keys = await redis.keys(`${roomPrefix(gameCode)}*`);
  if (keys.length === 0) {
    return;
  }

  await redis.del(keys);
};
