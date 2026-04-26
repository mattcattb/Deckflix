import {z} from "zod";
import {
  activeRoomClientSchema,
  gameCodeSchema,
  gameStatusSchema,
  roomClientSchema,
  type ActiveRoomClient,
  type DisplaySession,
  type GamePlayerPresence,
  type GameStatus,
  type PlayerSession,
  type RoomClient,
  type RoomSession,
} from "@deckflix/shared";
import {randomUUID} from "node:crypto";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";
import {withRedisLock} from "../lib/redis-lock";
import * as GameSettingsService from "../settings/game-settings.service";
import {
  publishDisplayMessage,
  publishPlayerMessage,
  type RealtimeServer,
} from "../realtime/realtime.service";

export const ROOM_TTL_SECONDS = 60 * 60 * 24;
const ROOM_LOCK_TTL_MS = 5_000;
const ROOM_LOCK_RETRY_COUNT = 40;
const ROOM_LOCK_RETRY_DELAY_MS = 50;

const displayRecordSchema = z.object({
  id: z.string().min(1),
  sessionToken: z.string().min(1),
});

const gameMetaRecordSchema = z.object({
  id: z.string().min(1),
  code: gameCodeSchema,
  roomName: z.string().min(1).max(60).nullable(),
  poolSeed: z.string().min(1),
  status: gameStatusSchema,
  createdAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  display: displayRecordSchema,
});

const gameStatusRecordSchema = z.object({
  status: gameStatusSchema,
  endedAt: z.string().datetime().nullable(),
});

const playerRecordSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(40),
  joinedAt: z.string().datetime(),
  sessionToken: z.string().min(1),
});

export type DisplayRecord = z.infer<typeof displayRecordSchema>;
export type GameMetaRecord = z.infer<typeof gameMetaRecordSchema>;
export type PlayerRecord = z.infer<typeof playerRecordSchema>;

export const normalizeGameCode = (gameCode: string) =>
  gameCode.trim().toUpperCase();

export const roomPrefix = (gameCode: string) =>
  `game:${normalizeGameCode(gameCode)}:`;

export const roomKey = (gameCode: string) => `${roomPrefix(gameCode)}room`;
const playersKey = (gameCode: string) => `${roomPrefix(gameCode)}players`;
const roomLockKey = (gameCode: string) => `${roomPrefix(gameCode)}lock`;

const parseJson = <T>(raw: string, schema: z.ZodType<T>, label: string): T => {
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    if (parsed.success) {
      return parsed.data;
    }
  } catch {
    // handled below
  }

  throw new NotFoundException(label);
};

const parsePlayer = (raw: string, label: string) =>
  parseJson(raw, playerRecordSchema, label);

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

export const createGameMeta = async (meta: GameMetaRecord) => {
  await ensureRedis();
  const normalized = normalizeGameCode(meta.code);
  const key = roomKey(normalized);
  const normalizedMeta = {
    id: meta.id,
    code: normalized,
    roomName: meta.roomName,
    createdAt: meta.createdAt,
  };
  const created = await redis.hSetNX(key, "meta", JSON.stringify(normalizedMeta));

  if (created) {
    const multi = redis.multi();
    multi.hSet(key, "status", JSON.stringify({
      status: meta.status,
      endedAt: meta.endedAt,
    }));
    multi.hSet(key, "display", JSON.stringify(meta.display));
    multi.hSet(key, "poolSeed", meta.poolSeed);
    multi.expire(key, ROOM_TTL_SECONDS);
    await multi.exec();
  }

  return Boolean(created);
};

export const getGameMetaOrThrow = async (gameCode: string) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const [metaRaw, statusRaw, displayRaw, poolSeed] = await redis.hmGet(
    roomKey(normalized),
    ["meta", "status", "display", "poolSeed"],
  );
  if (!metaRaw || !statusRaw || !displayRaw || !poolSeed) {
    throw new NotFoundException(`Game ${normalized} not found`);
  }

  const meta = parseJson(
    metaRaw,
    gameMetaRecordSchema.pick({
      id: true,
      code: true,
      roomName: true,
      createdAt: true,
    }),
    `Game ${normalized} not found`,
  );
  const status = parseJson(
    statusRaw,
    gameStatusRecordSchema,
    `Game ${normalized} not found`,
  );
  const display = parseJson(
    displayRaw,
    displayRecordSchema,
    `Game ${normalized} not found`,
  );

  return gameMetaRecordSchema.parse({
    ...meta,
    ...status,
    display,
    poolSeed,
  });
};

export const setGameMeta = async (gameCode: string, meta: GameMetaRecord) => {
  await ensureRedis();
  const key = roomKey(gameCode);
  const multi = redis.multi();
  multi.hSet(key, "meta", JSON.stringify({
    id: meta.id,
    code: normalizeGameCode(meta.code),
    roomName: meta.roomName,
    createdAt: meta.createdAt,
  }));
  multi.hSet(key, "status", JSON.stringify({
    status: meta.status,
    endedAt: meta.endedAt,
  }));
  multi.hSet(key, "display", JSON.stringify(meta.display));
  multi.hSet(key, "poolSeed", meta.poolSeed);
  multi.expire(key, ROOM_TTL_SECONDS);
  await multi.exec();
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

export const countPlayers = async (gameCode: string) => {
  await ensureRedis();
  return redis.hLen(playersKey(gameCode));
};

export const deletePlayerRecord = async (
  gameCode: string,
  playerId: string,
) => {
  await ensureRedis();
  await redis.hDel(playersKey(gameCode), playerId);
};

const getRoleConflictMessage = (role: RoomSession["role"]) =>
  role === "display"
    ? "This browser already owns the display for this room"
    : "This browser is already joined to this room as a player";

const isInvalidRoomSessionError = (error: unknown) =>
  error instanceof UnauthorizedException || error instanceof NotFoundException;

export const verifyDisplaySession = async (input: DisplaySession) => {
  let meta;
  try {
    meta = await getGameMetaOrThrow(input.gameCode);
  } catch (error) {
    if (error instanceof NotFoundException) {
      throw new UnauthorizedException("Invalid display session");
    }

    throw error;
  }

  if (
    meta.display.id !== input.displayId ||
    meta.display.sessionToken !== input.sessionToken
  ) {
    throw new UnauthorizedException("Invalid display session");
  }

  return {meta};
};

export const verifyPlayerSession = async (input: PlayerSession) => {
  const player = await getPlayerRecord(input.gameCode, input.playerId);
  if (!player || player.sessionToken !== input.sessionToken) {
    throw new UnauthorizedException("Invalid player session");
  }

  return {player};
};

export const verifyRoomSession = async (session: RoomSession) => {
  if (session.role === "display") {
    await verifyDisplaySession({
      gameCode: session.gameCode,
      displayId: session.roleId,
      sessionToken: session.sessionToken,
    });

    return session;
  }

  await verifyPlayerSession({
    gameCode: session.gameCode,
    playerId: session.roleId,
    sessionToken: session.sessionToken,
  });

  return session;
};

export const assertRoomSessionAvailable = async (session: RoomSession | null) => {
  if (!session) {
    return;
  }

  try {
    await verifyRoomSession(session);
  } catch (error) {
    if (isInvalidRoomSessionError(error)) {
      return;
    }

    throw error;
  }

  throw new ConflictException(
    `${getRoleConflictMessage(session.role)} in room ${session.gameCode}`,
  );
};

export const getActiveRoomClient = async (
  session: RoomSession | null,
): Promise<ActiveRoomClient> => {
  if (!session) {
    return activeRoomClientSchema.parse({role: "none"});
  }

  try {
    const verified = await verifyRoomSession(session);
    const [meta] = await Promise.all([
      getGameMetaOrThrow(verified.gameCode),
      GameSettingsService.getGameSettingsOrThrow(verified.gameCode),
    ]);
    return activeRoomClientSchema.parse({
      role: verified.role,
      gameCode: verified.gameCode,
      roomName: meta.roomName,
    });
  } catch (error) {
    if (isInvalidRoomSessionError(error)) {
      return activeRoomClientSchema.parse({role: "none"});
    }

    throw error;
  }
};

export const getRoomClient = async (input: {
  gameCode: string;
  session: RoomSession | null;
}): Promise<RoomClient> => {
  if (!input.session || input.session.gameCode !== input.gameCode) {
    return roomClientSchema.parse({role: "none"});
  }

  try {
    const verified = await verifyRoomSession(input.session);
    return roomClientSchema.parse({role: verified.role});
  } catch (error) {
    if (isInvalidRoomSessionError(error)) {
      return roomClientSchema.parse({role: "none"});
    }

    throw error;
  }
};

const publishRoomStarted = (
  server: RealtimeServer,
  gameCode: string,
) => {
  publishDisplayMessage(server, gameCode, {
    type: "room.started",
  });
};

const publishRoomStatusChanged = (
  server: RealtimeServer,
  gameCode: string,
  playerIds: string[],
  previousStatus: GameStatus,
  nextStatus: GameStatus,
) => {
  const message = {
    type: "room.status_changed" as const,
    payload: {
      previousStatus,
      nextStatus,
    },
  };

  publishDisplayMessage(server, gameCode, message);
  for (const playerId of playerIds) {
    publishPlayerMessage(server, gameCode, playerId, message);
  }
};

const publishRoomDeleted = (
  server: RealtimeServer,
  gameCode: string,
  playerIds: string[],
) => {
  publishDisplayMessage(server, gameCode, {
    type: "room.deleted",
  });

  for (const playerId of playerIds) {
    publishPlayerMessage(server, gameCode, playerId, {
      type: "room.deleted",
    });
  }
};

const generateGameCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

const publishStateForGame = async (server: RealtimeServer, gameCode: string) => {
  const playerIds = await listPlayerIds(gameCode);
  const GameStateService = await import("../state/game-state.service");
  await GameStateService.publishGameState(server, gameCode, playerIds);
};

const removePlayerState = async (gameCode: string, playerId: string) => {
  const DeckService = await import("../gameplay/deck.service");
  await Promise.all([
    DeckService.clearPlayerDeck(gameCode, playerId),
    deletePlayerRecord(gameCode, playerId),
  ]);
};

export const removePlayer = async (input: {
  gameCode: string;
  playerId: string;
  server: RealtimeServer;
}) => {
  await withRoomLock(input.gameCode, async () => {
    await removePlayerState(input.gameCode, input.playerId);
  });

  const gameCode = normalizeGameCode(input.gameCode);
  const PresenceService = await import("../presence/presence.service");
  PresenceService.publishPlayerLeft(input.server, gameCode, input.playerId);
  await publishStateForGame(input.server, gameCode);
  return {
    gameCode,
    playerId: input.playerId,
  };
};

export const leavePlayer = async (input: {
  player: PlayerSession;
  server: RealtimeServer;
}) => {
  await verifyPlayerSession(input.player);
  return removePlayer({
    gameCode: input.player.gameCode,
    playerId: input.player.playerId,
    server: input.server,
  });
};

export const join = async (input: {
  gameCode: string;
  displayName: string;
  server: RealtimeServer;
}) => {
  const playerId = randomUUID();
  const sessionToken = randomUUID();
  const joinedAt = new Date().toISOString();

  await withRoomLock(input.gameCode, async () => {
    const meta = await getGameMetaOrThrow(input.gameCode);
    if (meta.status === "completed") {
      throw new ConflictException("This room is completed");
    }

    await setPlayerRecord(input.gameCode, playerId, {
      id: playerId,
      displayName: input.displayName,
      joinedAt,
      sessionToken,
    });
  });

  const result = {
    gameCode: input.gameCode.trim().toUpperCase(),
    playerSession: {
      gameCode: input.gameCode.trim().toUpperCase(),
      playerId,
      sessionToken,
    },
    player: {
      id: playerId,
      displayName: input.displayName,
      joinedAt,
      connectedAsPlayer: false,
    } satisfies GamePlayerPresence,
  };
  const PresenceService = await import("../presence/presence.service");
  PresenceService.publishPlayerJoined(input.server, result.gameCode, result.player);
  await publishStateForGame(input.server, result.gameCode);
  return result;
};

export const create = async (input: {
  roomName?: string;
  settings?: import("@deckflix/shared").GameSettingsInput;
}) => {
  const createdAt = new Date().toISOString();
  const settings = GameSettingsService.resolveGameSettings(input.settings);
  const roomName = input.roomName?.trim() || null;
  const displayId = randomUUID();
  const sessionToken = randomUUID();
  const RecommendationsService = await import("../recommendations/recommendations.service");
  const poolSeed = RecommendationsService.createPoolSeed();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const gameCode = generateGameCode();
    const created = await createGameMeta({
      id: randomUUID(),
      code: gameCode,
      roomName,
      poolSeed,
      status: "lobby",
      createdAt,
      endedAt: null,
      display: {
        id: displayId,
        sessionToken,
      },
    });

    if (created) {
      await GameSettingsService.setGameSettings(gameCode, settings);
      return {
        gameCode,
        displaySession: {
          gameCode,
          displayId,
          sessionToken,
        },
      };
    }
  }

  throw new BadRequestException("Unable to generate game code");
};

export const updateSettings = async (input: {
  gameCode: string;
  settings: import("@deckflix/shared").GameSettingsInput;
}) =>
  withRoomLock(input.gameCode, async () => {
    const currentSettings = await GameSettingsService.getGameSettingsOrThrow(input.gameCode);
    const nextSettings = GameSettingsService.mergeGameSettings(
      currentSettings,
      input.settings,
    );

    await GameSettingsService.setGameSettings(input.gameCode, nextSettings);

    const GameStateService = await import("../state/game-state.service");
    return GameStateService.getGameMeta(input.gameCode);
  });

export const start = async (input: {
  gameCode: string;
  server: RealtimeServer;
}) =>
  withRoomLock(input.gameCode, async () => {
    const playerIds = await listPlayerIds(input.gameCode);
    if (playerIds.length < 2) {
      throw new BadRequestException("Need at least 2 players to start");
    }

    const settings = await GameSettingsService.getGameSettingsOrThrow(input.gameCode);
    const RecommendationsService = await import("../recommendations/recommendations.service");
    const movies = await RecommendationsService.generatePool({
      gameCode: input.gameCode,
      settings,
    });
    await RecommendationsService.savePool(input.gameCode, movies);

    const DeckService = await import("../gameplay/deck.service");
    await DeckService.initializePlayerDecks(
      input.gameCode,
      playerIds,
      movies.length,
    );

    const meta = await getGameMetaOrThrow(input.gameCode);
    const previousStatus = meta.status;
    await setGameMeta(input.gameCode, {
      ...meta,
      status: "swiping",
      endedAt: null,
    });

    return {
      gameCode: input.gameCode.trim().toUpperCase(),
      previousStatus,
      nextStatus: "swiping" as const,
      playerIds,
    };
  }).then(async (result) => {
    publishRoomStatusChanged(
      input.server,
      result.gameCode,
      result.playerIds,
      result.previousStatus,
      result.nextStatus,
    );
    publishRoomStarted(input.server, result.gameCode);
    await publishStateForGame(input.server, result.gameCode);
    return result;
  });

export const end = (input: {
  gameCode: string;
  displayId: string;
  sessionToken: string;
  server: RealtimeServer;
}) =>
  withRoomLock(input.gameCode, async () => {
    await verifyDisplaySession({
      gameCode: input.gameCode,
      displayId: input.displayId,
      sessionToken: input.sessionToken,
    });

    const playerIds = await listPlayerIds(input.gameCode);
    const meta = await getGameMetaOrThrow(input.gameCode);
    const endedAt = new Date().toISOString();
    const previousStatus = meta.status;

    await setGameMeta(input.gameCode, {
      ...meta,
      status: "completed",
      endedAt,
    });

    publishRoomStatusChanged(
      input.server,
      input.gameCode,
      playerIds,
      previousStatus,
      "completed",
    );
    publishRoomDeleted(input.server, input.gameCode, playerIds);

    await deleteRoomKeys(input.gameCode);
    const PresenceService = await import("../presence/presence.service");
    PresenceService.clearPresenceState(input.gameCode);
  });
