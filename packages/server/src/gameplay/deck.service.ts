import {createHash} from "node:crypto";
import {redisClient} from "../redis/redis";
import * as PoolService from "../pool/pool.service";
import * as RoomsService from "../rooms/rooms.service";
import {normalizeGameCode, ROOM_TTL_SECONDS} from "../rooms/room-keys";

const PLAYER_DECK_TARGET = 3;
const PLAYER_DECK_RANDOMIZATION_WINDOW = PLAYER_DECK_TARGET * 2;
const PLAYER_DECK_TOP_UP_SCAN_LIMIT = 250;

const KEYS = {
  DECK: (gameCode: string, playerId: string) =>
    `game:${normalizeGameCode(gameCode)}:deck:${playerId}`,
  ASSIGNED: (gameCode: string, playerId: string) =>
    `game:${normalizeGameCode(gameCode)}:deck_assigned:${playerId}`,
  CURSOR: (gameCode: string, playerId: string) =>
    `game:${normalizeGameCode(gameCode)}:deck_cursor:${playerId}`,
};

const deckKey = KEYS.DECK;
const assignedKey = (gameCode: string, playerId: string) =>
  KEYS.ASSIGNED(gameCode, playerId);
const cursorKey = (gameCode: string, playerId: string) =>
  KEYS.CURSOR(gameCode, playerId);

const queueSeedValue = (value: string) =>
  Number.parseInt(
    createHash("sha256").update(value).digest("hex").slice(0, 8),
    16,
  );

const getQueueWindowIndex = (order: number) =>
  Math.floor(order / PLAYER_DECK_RANDOMIZATION_WINDOW);

export const orderPoolEntriesForPlayer = (
  entries: PoolService.PoolEntry[],
  seed: string,
  playerId: string,
  signals = new Map<string, number>(),
) =>
  [...entries].sort((left, right) => {
    const windowDelta =
      getQueueWindowIndex(left.order) - getQueueWindowIndex(right.order);
    if (windowDelta !== 0) {
      return windowDelta;
    }

    const signalDelta =
      (signals.get(right.movieId) ?? 0) - (signals.get(left.movieId) ?? 0);
    if (signalDelta !== 0) {
      return signalDelta;
    }

    const leftSeed = queueSeedValue(`${seed}:${playerId}:${left.movieId}`);
    const rightSeed = queueSeedValue(`${seed}:${playerId}:${right.movieId}`);
    if (leftSeed !== rightSeed) {
      return leftSeed - rightSeed;
    }

    return left.order - right.order;
  });

const parseNumber = (raw: string | null) => {
  if (!raw) {
    return 0;
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

const getDeckLength = async (gameCode: string, playerId: string) => {
  const deckKey = KEYS.DECK(gameCode, playerId);
  return redisClient.lLen(deckKey);
};

const getCursor = async (gameCode: string, playerId: string) => {
  const cursorKey = KEYS.CURSOR(gameCode, playerId);
  return parseNumber(await redisClient.get(cursorKey));
};

export const getPlayerPoolCursor = async (
  gameCode: string,
  playerId: string,
) => getCursor(gameCode, playerId);

export const refreshPlayerDeck = async (
  gameCode: string,
  playerId: string,
  targetSize = PLAYER_DECK_TARGET,
) => {
  const [currentLength, cursor, meta, poolEntries] = await Promise.all([
    getDeckLength(gameCode, playerId),
    getCursor(gameCode, playerId),
    RoomsService.getGameMetaOrThrow(gameCode),
    PoolService.listPoolEntries(gameCode),
  ]);
  if (currentLength >= targetSize || cursor >= poolEntries.length) {
    return;
  }
  const signals = await PoolService.getPoolSignals(
    gameCode,
    poolEntries.map((entry) => entry.movieId),
  );

  const orderedEntries = orderPoolEntriesForPlayer(
    poolEntries,
    meta.poolSeed,
    playerId,
    signals,
  );
  const needed = targetSize - currentLength;
  const candidates = orderedEntries
    .slice(0, PLAYER_DECK_TOP_UP_SCAN_LIMIT)
    .map((entry) => entry.movieId);
  const memberships = candidates.length
    ? await redisClient.smIsMember(assignedKey(gameCode, playerId), candidates)
    : [];
  const acceptedMovieIds = candidates
    .filter((_, index) => memberships[index] === 0)
    .slice(0, needed);
  const nextCursor = Math.min(
    poolEntries.length,
    cursor + acceptedMovieIds.length,
  );

  const multi = redisClient.multi();
  if (acceptedMovieIds.length > 0) {
    multi.rPush(deckKey(gameCode, playerId), acceptedMovieIds);
    multi.sAdd(assignedKey(gameCode, playerId), acceptedMovieIds);
    multi.expire(deckKey(gameCode, playerId), ROOM_TTL_SECONDS);
    multi.expire(assignedKey(gameCode, playerId), ROOM_TTL_SECONDS);
  }
  multi.set(cursorKey(gameCode, playerId), String(nextCursor), {
    EX: ROOM_TTL_SECONDS,
  });
  await multi.exec();
};

export const peekCurrentMovieId = async (
  gameCode: string,
  playerId: string,
): Promise<string | null> => {
  const deckKey = KEYS.DECK(gameCode, playerId);

  return redisClient.lIndex(deckKey, 0);
};

export const popCurrentMovieId = async (
  gameCode: string,
  playerId: string,
  expectedMovieId?: string,
) => {
  const result = (await redisClient.eval(
    `
      local current = redis.call("LINDEX", KEYS[1], 0)
      if not current then return {0, ""} end
      if ARGV[1] ~= "" and current ~= ARGV[1] then return {1, current} end
      redis.call("LPOP", KEYS[1])
      return {2, current}
    `,
    {
      keys: [KEYS.DECK(gameCode, playerId)],
      arguments: [expectedMovieId ?? ""],
    },
  )) as [number, string];
  const [status, current] = result;
  if (status === 0) {
    return {status: "empty" as const};
  }
  if (status === 1) {
    return {status: "mismatch" as const, movieId: current};
  }
  return {status: "ok" as const, movieId: current};
};

export const getPlayerDeckStatus = async (
  gameCode: string,
  playerId: string,
) => {
  const [poolSize, cursor, deckLength] = await Promise.all([
    PoolService.getPoolSize(gameCode),
    getCursor(gameCode, playerId),
    getDeckLength(gameCode, playerId),
  ]);

  return {
    currentIndex: Math.min(poolSize, Math.max(0, cursor - deckLength)),
    completed: poolSize > 0 && cursor >= poolSize && deckLength === 0,
    remainingCount: deckLength,
  };
};
