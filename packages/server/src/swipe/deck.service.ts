import {createHash} from "node:crypto";
import {BadRequestException} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";
import {
  normalizeGameCode,
  ROOM_TTL_SECONDS,
} from "../rooms/room-lifecycle.service";
import * as PoolService from "../pool/pool.service";
import * as RoomMetaService from "../rooms/room-meta.service";

export const PLAYER_DECK_TARGET = 3;
export const PLAYER_DECK_REFILL_THRESHOLD = 1;
const PLAYER_DECK_RANDOMIZATION_WINDOW = PLAYER_DECK_TARGET * 2;
const PLAYER_DECK_TOP_UP_SCAN_LIMIT = 250;

type PopDeckResult =
  | {status: "popped"; movieId: string}
  | {status: "empty"}
  | {status: "mismatch"; actualMovieId: string};

const roomPrefix = (gameCode: string) => `game:${normalizeGameCode(gameCode)}:`;
const deckKey = (gameCode: string, playerId: string) =>
  `${roomPrefix(gameCode)}deck:${playerId}`;
const assignedKey = (gameCode: string, playerId: string) =>
  `${roomPrefix(gameCode)}deck_assigned:${playerId}`;
const cursorKey = (gameCode: string, playerId: string) =>
  `${roomPrefix(gameCode)}deck_cursor:${playerId}`;

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

export const clearPlayerDeck = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  await redis.del([
    deckKey(gameCode, playerId),
    assignedKey(gameCode, playerId),
    cursorKey(gameCode, playerId),
  ]);
};

export const getDeckLength = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  return redis.lLen(deckKey(gameCode, playerId));
};

export const getCursor = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  return parseNumber(await redis.get(cursorKey(gameCode, playerId)));
};

export const peekCurrentMovieId = async (
  gameCode: string,
  playerId: string,
) => {
  await ensureRedis();
  return redis.lIndex(deckKey(gameCode, playerId), 0);
};

export const topUpPlayerDeck = async (
  gameCode: string,
  playerId: string,
  targetSize = PLAYER_DECK_TARGET,
) => {
  const [currentLength, cursor, meta, poolEntries] = await Promise.all([
    getDeckLength(gameCode, playerId),
    getCursor(gameCode, playerId),
    RoomMetaService.getGameMetaOrThrow(gameCode),
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
    if (!(await redis.sIsMember(assignedKey(gameCode, playerId), movieId))) {
      acceptedMovieIds.push(movieId);
    }
  }

  const multi = redis.multi();
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

export const initializePlayerDecks = async (
  gameCode: string,
  playerIds: string[],
  targetSize: number,
) => {
  await Promise.all(
    playerIds.map(async (playerId) => {
      await clearPlayerDeck(gameCode, playerId);
      await topUpPlayerDeck(gameCode, playerId, targetSize);
    }),
  );
};

export const peekOrTopUpCurrentMovieId = async (
  gameCode: string,
  playerId: string,
) => {
  let movieId = await peekCurrentMovieId(gameCode, playerId);
  if (movieId) {
    const deckLength = await getDeckLength(gameCode, playerId);
    if (deckLength <= PLAYER_DECK_REFILL_THRESHOLD) {
      await topUpPlayerDeck(gameCode, playerId);
    }
    return movieId;
  }

  await topUpPlayerDeck(gameCode, playerId);
  movieId = await peekCurrentMovieId(gameCode, playerId);
  return movieId;
};

export const popCurrentMovieId = async (
  gameCode: string,
  playerId: string,
  expectedMovieId?: string,
): Promise<PopDeckResult> => {
  await ensureRedis();
  const result = await redis.eval(
    `
      local current = redis.call("LINDEX", KEYS[1], 0)
      if not current then
        return {"empty"}
      end
      if ARGV[1] ~= "" and current ~= ARGV[1] then
        return {"mismatch", current}
      end
      return {"popped", redis.call("LPOP", KEYS[1])}
    `,
    {
      keys: [deckKey(gameCode, playerId)],
      arguments: [expectedMovieId ?? ""],
    },
  );
  const [status, movieId] = result as [string, string | undefined];
  if (status === "empty") {
    return {status};
  }
  if (status === "mismatch") {
    return {status, actualMovieId: movieId ?? ""};
  }
  if (!movieId) {
    throw new BadRequestException("No active movie");
  }
  return {status: "popped", movieId};
};

export const getCurrentIndex = async (gameCode: string, playerId: string) => {
  const [poolSize, deckLength] = await Promise.all([
    PoolService.getPoolSize(gameCode),
    getDeckLength(gameCode, playerId),
  ]);
  return Math.max(0, poolSize - deckLength);
};

export const getRemainingCount = getDeckLength;

export const isPlayerCompleted = async (gameCode: string, playerId: string) =>
  (await getDeckLength(gameCode, playerId)) === 0;
