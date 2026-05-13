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
) =>
  [...entries].sort((left, right) => {
    const windowDelta =
      getQueueWindowIndex(left.order) - getQueueWindowIndex(right.order);
    if (windowDelta !== 0) {
      return windowDelta;
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

const topUpPlayerDeck = async (
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

  const orderedEntries = orderPoolEntriesForPlayer(
    poolEntries,
    meta.poolSeed,
    playerId,
  );
  const needed = targetSize - currentLength;
  const acceptedMovieIds: string[] = [];
  let nextCursor = cursor;

  while (
    nextCursor < orderedEntries.length &&
    acceptedMovieIds.length < needed &&
    nextCursor - cursor < PLAYER_DECK_TOP_UP_SCAN_LIMIT
  ) {
    const movieId = orderedEntries[nextCursor].movieId;
    nextCursor += 1;
    if (
      !(await redisClient.sIsMember(assignedKey(gameCode, playerId), movieId))
    ) {
      acceptedMovieIds.push(movieId);
    }
  }

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

const peekDeck = async (
  gameCode: string,
  playerId: string,
): Promise<string | null> => {
  const deckKey = KEYS.DECK(gameCode, playerId);

  return redisClient.lIndex(deckKey, 0);
};

const popDeck = async (
  gameCode: string,
  playerId: string,
): Promise<string | null> => {
  const deckKey = KEYS.DECK(gameCode, playerId);

  const top = await redisClient.lPop(deckKey);

  return top;
};

export const peekOrTopUpCurrentMovieId = async (
  gameCode: string,
  playerId: string,
) => {
  const current = await peekDeck(gameCode, playerId);
  if (current) {
    return current;
  }

  await topUpPlayerDeck(gameCode, playerId);
  return peekDeck(gameCode, playerId);
};

export const popCurrentMovieId = async (
  gameCode: string,
  playerId: string,
  expectedMovieId?: string,
) => {
  const current = await peekOrTopUpCurrentMovieId(gameCode, playerId);
  if (!current) {
    return {status: "empty" as const};
  }
  if (expectedMovieId && current !== expectedMovieId) {
    return {status: "mismatch" as const, movieId: current};
  }

  await popDeck(gameCode, playerId);
  void topUpPlayerDeck(gameCode, playerId);
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
