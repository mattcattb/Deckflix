import {emitEvent} from "../common/app-events";
import {redisClient} from "../redis/redis";
import {
  normalizeGameCode,
  ROOM_TTL_SECONDS,
  roomPrefix,
} from "../rooms/room-keys";

const playerPresenceKey = (gameCode: string) =>
  `${roomPrefix(gameCode)}presence:player_connections`;

export const isPlayerConnected = async (gameCode: string, playerId: string) => {
  return Boolean(
    await redisClient.hExists(playerPresenceKey(gameCode), playerId),
  );
};

export const listConnectedPlayerIds = async (gameCode: string) => {
  return redisClient.hKeys(playerPresenceKey(gameCode));
};

export const clearPresenceState = async (gameCode: string) => {
  await redisClient.del(playerPresenceKey(gameCode));
};

export const clearPlayerPresence = async (gameCode: string, playerId: string) => {
  await redisClient.hDel(playerPresenceKey(gameCode), playerId);
};

export const connectPlayer = async (input: {
  gameCode: string;
  playerId: string;
}) => {
  const key = normalizeGameCode(input.gameCode);
  const presenceKey = playerPresenceKey(key);
  const connectionCount = await redisClient.hIncrBy(
    presenceKey,
    input.playerId,
    1,
  );
  await redisClient.expire(presenceKey, ROOM_TTL_SECONDS);

  if (connectionCount === 1) {
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
  const disconnected = await redisClient.eval(
    `
      local count = tonumber(redis.call("HGET", KEYS[1], ARGV[1]) or "0")
      if count <= 0 then return 0 end
      if count == 1 then
        redis.call("HDEL", KEYS[1], ARGV[1])
        return 1
      end
      redis.call("HINCRBY", KEYS[1], ARGV[1], -1)
      return 0
    `,
    {
      keys: [playerPresenceKey(key)],
      arguments: [input.playerId],
    },
  );
  if (disconnected !== 1) {
    return;
  }

  emitEvent("player.disconnected", {
    gameCode: key,
    playerId: input.playerId,
  });
};
