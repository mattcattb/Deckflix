import {randomUUID} from "node:crypto";
import {z} from "zod";
import {
  playerIconIdSchema,
  type GamePlayerPresence,
  type PlayerIconId,
  type PlayerProfileInput,
} from "@deckflix/shared";
import {emitEvent} from "../common/app-events";
import {NotFoundException} from "../common/errors";
import {parseJson} from "../lib/json";
import * as PresenceService from "../presence/presence.service";
import {redisClient} from "../redis/redis";
import {
  normalizeGameCode,
  playersKey,
  ROOM_TTL_SECONDS,
  withRoomLock,
} from "../rooms/room-keys";

const storedPlayerRecordSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(40),
  iconId: playerIconIdSchema.optional(),
  joinedAt: z.string().datetime(),
  sessionToken: z.string().min(1),
});

type PlayerRecord = Omit<
  z.infer<typeof storedPlayerRecordSchema>,
  "iconId"
> & {
  iconId: PlayerIconId;
};

const parsePlayer = (raw: string, label: string) => {
  const player = parseJson(raw, storedPlayerRecordSchema, label);
  return {
    ...player,
    iconId: player.iconId ?? "popcorn",
  } satisfies PlayerRecord;
};

const toPlayerPresence = async (
  player: PlayerRecord,
  gameCode: string,
): Promise<GamePlayerPresence> => {
  const connectedAsPlayer = await PresenceService.isPlayerConnected(
    gameCode,
    player.id,
  );

  return {
    id: player.id,
    displayName: player.displayName,
    iconId: player.iconId,
    joinedAt: player.joinedAt,
    connectedAsPlayer,
  };
};

export const getPlayerRecord = async (gameCode: string, playerId: string) => {
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
  const key = playersKey(gameCode);
  await redisClient.hSet(key, playerId, JSON.stringify(record));
  await redisClient.expire(key, ROOM_TTL_SECONDS);
};

export const listPlayers = async (gameCode: string) => {
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
  return redisClient.hLen(playersKey(gameCode));
};

const deletePlayerRecord = async (
  gameCode: string,
  playerId: string,
) => {
  await redisClient.hDel(playersKey(gameCode), playerId);
};

export const deleteRoomPlayers = async (gameCode: string) => {
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
  await PresenceService.clearPlayerPresence(gameCode, input.playerId);
  emitEvent("player.left", {
    gameCode,
    playerId: input.playerId,
  });

  return {
    gameCode,
    playerId: input.playerId,
  };
};

export const kickPlayer = async (input: {
  gameCode: string;
  playerId: string;
}) => {
  await withRoomLock(input.gameCode, async () => {
    const player = await getPlayerRecord(input.gameCode, input.playerId);
    if (!player) {
      throw new NotFoundException("Player not found");
    }

    await deletePlayerRecord(input.gameCode, input.playerId);
  });

  const gameCode = normalizeGameCode(input.gameCode);
  await PresenceService.clearPlayerPresence(gameCode, input.playerId);
  emitEvent("player.kicked", {
    gameCode,
    playerId: input.playerId,
  });

  return {
    gameCode,
    playerId: input.playerId,
  };
};

export const updatePlayerProfile = async (input: {
  gameCode: string;
  playerId: string;
  profile: PlayerProfileInput;
}) => {
  let updatedPlayer: PlayerRecord | null = null;

  await withRoomLock(input.gameCode, async () => {
    const player = await getPlayerRecord(input.gameCode, input.playerId);
    if (!player) {
      throw new NotFoundException("Player not found");
    }

    updatedPlayer = {
      ...player,
      displayName: input.profile.displayName ?? player.displayName,
      iconId: input.profile.iconId ?? player.iconId,
    };

    await setPlayerRecord(input.gameCode, input.playerId, updatedPlayer);
  });

  const gameCode = normalizeGameCode(input.gameCode);
  if (!updatedPlayer) {
    throw new NotFoundException("Player not found");
  }

  const player = await toPlayerPresence(updatedPlayer, gameCode);
  emitEvent("player.updated", {
    gameCode,
    player,
  });

  return player;
};

export const join = async (input: {
  gameCode: string;
  displayName: string;
}) => {
  const playerId = randomUUID();
  const sessionToken = randomUUID();
  const joinedAt = new Date().toISOString();
  const iconId: PlayerIconId = "popcorn";

  await withRoomLock(input.gameCode, async () => {
    await setPlayerRecord(input.gameCode, playerId, {
      id: playerId,
      displayName: input.displayName,
      iconId,
      joinedAt,
      sessionToken,
    });
  });

  const gameCode = normalizeGameCode(input.gameCode);
  const player = {
    id: playerId,
    displayName: input.displayName,
    iconId,
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
