import {emitEvent} from "../common/app-events";
import {redisClient} from "../redis/redis";
import {
  normalizeGameCode,
  ROOM_TTL_SECONDS,
  roomPrefix,
} from "../rooms/room-keys";

const playerPresenceKey = (gameCode: string) =>
  `${roomPrefix(gameCode)}presence:players`;

export const isPlayerConnected = async (gameCode: string, playerId: string) => {
  return Boolean(
    await redisClient.sIsMember(playerPresenceKey(gameCode), playerId),
  );
};

export const listConnectedPlayerIds = async (gameCode: string) => {
  return redisClient.sMembers(playerPresenceKey(gameCode));
};

export const clearPresenceState = async (gameCode: string) => {
  await redisClient.del(playerPresenceKey(gameCode));
};

export const clearPlayerPresence = async (gameCode: string, playerId: string) => {
  await redisClient.sRem(playerPresenceKey(gameCode), playerId);
};

export const connectPlayer = async (input: {
  gameCode: string;
  playerId: string;
}) => {
  const key = normalizeGameCode(input.gameCode);
  const presenceKey = playerPresenceKey(key);
  const added = await redisClient.sAdd(presenceKey, input.playerId);
  await redisClient.expire(presenceKey, ROOM_TTL_SECONDS);

  if (added > 0) {
    emitEvent("player.connected", {
      gameCode: key,
      playerId: input.playerId,
    });
  }
};

export const disconnectPlayer = async (input: {
  gameCode: string;
  playerId: string;
}) => {
  const key = normalizeGameCode(input.gameCode);
  const removed = await redisClient.sRem(playerPresenceKey(key), input.playerId);
  if (removed === 0) {
    return;
  }

  emitEvent("player.disconnected", {
    gameCode: key,
    playerId: input.playerId,
  });
};
