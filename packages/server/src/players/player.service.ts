import {randomUUID} from "node:crypto";
import {z} from "zod";
import {type GamePlayerPresence} from "@deckflix/shared";
import {emitEvent} from "../common/app-events";
import {parseJson} from "../lib/json";
import * as PresenceService from "../presence/presence.service";
import {ensureRedis, redisClient} from "../redis/redis";
import {
  normalizeGameCode,
  playersKey,
  ROOM_TTL_SECONDS,
  withRoomLock,
} from "../rooms/room-keys";

const playerRecordSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(40),
  joinedAt: z.string().datetime(),
  sessionToken: z.string().min(1),
});

export type PlayerRecord = z.infer<typeof playerRecordSchema>;

const parsePlayer = (raw: string, label: string) =>
  parseJson(raw, playerRecordSchema, label);

export const getPlayerRecord = async (gameCode: string, playerId: string) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const raw = await redisClient.hGet(playersKey(normalized), playerId);
  if (!raw) {
    return null;
  }

  return parsePlayer(raw, `Player ${playerId} not found in game ${normalized}`);
};

const setPlayerRecord = async (
  gameCode: string,
  playerId: string,
  record: PlayerRecord,
) => {
  await ensureRedis();
  const key = playersKey(gameCode);
  await redisClient.hSet(key, playerId, JSON.stringify(record));
  await redisClient.expire(key, ROOM_TTL_SECONDS);
};

export const listPlayers = async (gameCode: string) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const raws = Object.values(await redisClient.hGetAll(playersKey(normalized)));
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

export const countPlayers = async (gameCode: string) => {
  await ensureRedis();
  return redisClient.hLen(playersKey(gameCode));
};

const deletePlayerRecord = async (
  gameCode: string,
  playerId: string,
) => {
  await ensureRedis();
  await redisClient.hDel(playersKey(gameCode), playerId);
};

export const deleteRoomPlayers = async (gameCode: string) => {
  await ensureRedis();
  await redisClient.del(playersKey(gameCode));
};

export const removePlayer = async (input: {
  gameCode: string;
  playerId: string;
}) => {
  await withRoomLock(input.gameCode, async () => {
    await deletePlayerRecord(input.gameCode, input.playerId);
  });

  const gameCode = normalizeGameCode(input.gameCode);
  PresenceService.clearPlayerPresence(gameCode, input.playerId);
  emitEvent("player.left", {
    gameCode,
    playerId: input.playerId,
  });

  return {
    gameCode,
    playerId: input.playerId,
  };
};

export const join = async (input: {
  gameCode: string;
  displayName: string;
}) => {
  const playerId = randomUUID();
  const sessionToken = randomUUID();
  const joinedAt = new Date().toISOString();

  await withRoomLock(input.gameCode, async () => {
    await setPlayerRecord(input.gameCode, playerId, {
      id: playerId,
      displayName: input.displayName,
      joinedAt,
      sessionToken,
    });
  });

  const gameCode = normalizeGameCode(input.gameCode);
  const player = {
    id: playerId,
    displayName: input.displayName,
    joinedAt,
    connectedAsPlayer: false,
  } satisfies GamePlayerPresence;

  emitEvent("player.joined", {
    gameCode,
    player,
  });

  return {
    gameCode,
    playerSession: {
      gameCode,
      playerId,
      sessionToken,
    },
    player,
  };
};
