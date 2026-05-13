import {z} from "zod";
import {
  gameCodeSchema,
  gameStatusSchema,
  resolveRoomName,
  type GameSettingsInput,
} from "@deckflix/shared";
import {randomUUID} from "node:crypto";
import * as MovieStateService from "../gameplay/movie-state.service";
import {emitEvent} from "../common/app-events";
import * as PreferencesService from "./room-preferences.service";
import * as MovieMetadataService from "../movies/movie-metadata.service";
import * as PresenceService from "../presence/presence.service";
import * as RecommendationsService from "../recommendations/recommendations.service";
import * as PoolService from "../pool/pool.service";

import {
  BadRequestException,
  NotFoundException,
} from "../common/errors";
import {redisClient} from "../redis/redis";
import * as RoomSettingsService from "./room-settings.service";
import {parseJson} from "../lib/json";
import {generateGameCode} from "../lib/gen";
import * as PlayerService from "../players/player.service";
export {
  normalizeGameCode,
  roomKey,
  roomPrefix,
} from "./room-keys";
import {
  normalizeGameCode,
  roomKey,
  ROOM_TTL_SECONDS,
  withRoomLock,
} from "./room-keys";

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

type DisplayRecord = z.infer<typeof displayRecordSchema>;
export type GameMetaRecord = z.infer<typeof gameMetaRecordSchema>;

const createGameMeta = async (meta: GameMetaRecord) => {
  const normalized = normalizeGameCode(meta.code);
  const key = roomKey(normalized);
  const normalizedMeta = {
    id: meta.id,
    code: normalized,
    roomName: meta.roomName,
    createdAt: meta.createdAt,
  };
  const created = await redisClient.hSetNX(
    key,
    "meta",
    JSON.stringify(normalizedMeta),
  );

  if (created) {
    const multi = redisClient.multi();
    multi.hSet(
      key,
      "status",
      JSON.stringify({
        status: meta.status,
        endedAt: meta.endedAt,
      }),
    );
    multi.hSet(key, "display", JSON.stringify(meta.display));
    multi.hSet(key, "poolSeed", meta.poolSeed);
    multi.expire(key, ROOM_TTL_SECONDS);
    await multi.exec();
  }

  return Boolean(created);
};

export const getGameMetaOrThrow = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  const [metaRaw, statusRaw, displayRaw, poolSeed] = await redisClient.hmGet(
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

const setGameMeta = async (gameCode: string, meta: GameMetaRecord) => {
  const key = roomKey(gameCode);
  const multi = redisClient.multi();
  multi.hSet(
    key,
    "meta",
    JSON.stringify({
      id: meta.id,
      code: normalizeGameCode(meta.code),
      roomName: meta.roomName,
      createdAt: meta.createdAt,
    }),
  );
  multi.hSet(
    key,
    "status",
    JSON.stringify({
      status: meta.status,
      endedAt: meta.endedAt,
    }),
  );
  multi.hSet(key, "display", JSON.stringify(meta.display));
  multi.hSet(key, "poolSeed", meta.poolSeed);
  multi.expire(key, ROOM_TTL_SECONDS);
  await multi.exec();
};

export const updateSettings = async (input: {
  gameCode: string;
  settings: GameSettingsInput;
}) => {
  const current = await RoomSettingsService.getGameSettingsOrThrow(
    input.gameCode,
  );
  const next = RoomSettingsService.mergeGameSettings(current, input.settings);
  await RoomSettingsService.setGameSettings(input.gameCode, next);
  return next;
};

export const create = async (input: {
  roomName?: string;
  settings?: GameSettingsInput;
}) => {
  const createdAt = new Date().toISOString();
  const settings = RoomSettingsService.resolveGameSettings(input.settings);
  const roomName = resolveRoomName(input.roomName);
  const displayId = randomUUID();
  const sessionToken = randomUUID();

  const poolSeed = RecommendationsService.createRecommendationSeed();

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
      await Promise.all([
        RoomSettingsService.setGameSettings(gameCode, settings),
        PreferencesService.createGamePreferences(gameCode),
      ]);
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

export const start = async (input: {
  gameCode: string;
}) =>
  withRoomLock(input.gameCode, async () => {
    const playerIds = await PlayerService.listPlayerIds(input.gameCode);
    if (playerIds.length < 2) {
      throw new BadRequestException("Need at least 2 players to start");
    }

    const [meta, settings, preferences] = await Promise.all([
      getGameMetaOrThrow(input.gameCode),
      RoomSettingsService.getGameSettingsOrThrow(input.gameCode),
      PreferencesService.getGamePreferencesOrThrow(input.gameCode),
    ]);

    const movies = await RecommendationsService.generateInitialRecommendations({
      gameCode: input.gameCode,
      poolSeed: meta.poolSeed,
      settings,
      preferences,
    });
    await Promise.all([
      MovieMetadataService.replaceRoomMovieMetadata(input.gameCode, movies),
      PoolService.replacePool(
        input.gameCode,
        movies.map((movie) => movie.id),
      ),
    ]);
    await MovieStateService.initializeMovieStates(
      input.gameCode,
      movies.map((movie) => movie.id),
    );

    await setGameMeta(input.gameCode, {
      ...meta,
      status: "swiping",
      endedAt: null,
    });

    const gameCode = input.gameCode.trim().toUpperCase();
    emitEvent("room.started", {
      gameCode,
    });

    return {
      gameCode,
      previousStatus: meta.status,
      nextStatus: "swiping" as const,
      playerIds,
    };
  });

export const end = (input: {
  gameCode: string;
}) =>
  withRoomLock(input.gameCode, async () => {
    const playerIds = await PlayerService.listPlayerIds(input.gameCode);
    const meta = await getGameMetaOrThrow(input.gameCode);
    const endedAt = new Date().toISOString();
    const previousStatus = meta.status;

    await setGameMeta(input.gameCode, {
      ...meta,
      status: "completed",
      endedAt,
    });

    await Promise.all([
      redisClient.del(roomKey(input.gameCode)),
      PlayerService.deleteRoomPlayers(input.gameCode),
      PresenceService.clearPresenceState(input.gameCode),
    ]);

    const gameCode = normalizeGameCode(input.gameCode);
    emitEvent("room.deleted", {
      gameCode,
    });

    return {
      gameCode,
      previousStatus,
      nextStatus: "completed" as const,
      playerIds,
    };
  });
