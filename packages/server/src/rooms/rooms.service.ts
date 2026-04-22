import type {GamePlayerPresence, RoomSession} from "@deckflix/shared";
import * as RoomStatePublisher from "../ws/room-state-publisher";
import * as GameSnapshotService from "../games/game-snapshot.service";
import * as GamePoolService from "../games/game-pool";
import {BadRequestException, ConflictException} from "../common/errors";
import {randomUUID} from "node:crypto";
import {clearPresenceState} from "../ws/presence.ws";
import * as GameRedisService from "../games/game-redis.service";
import * as GameSettingsService from "../settings/game-settings.service";
import * as RoomMetaService from "./room-meta.service";
import * as RoomSessionService from "./room-session.service";
import * as SwipeService from "../swipe/swipe.service";
import {publishDisplayMessage, publishPlayerMessage} from "../ws/topics";

type RealtimeServer = {publish: (topic: string, payload: string) => void};

export const getActiveClient = (session: RoomSession | null) =>
  RoomSessionService.getActiveRoomClient(session);

export const getClient = (input: {gameCode: string; session: RoomSession | null}) =>
  RoomSessionService.getRoomClient(input);

export const getMeta = (gameCode: string) => GameSnapshotService.getGameMeta(gameCode);
export const getPlayers = (gameCode: string) =>
  GameSnapshotService.getGamePlayers(gameCode);
export const getResults = (gameCode: string) =>
  GameSnapshotService.getGameResults(gameCode);
export const ensureRoomSessionAvailable = (session: RoomSession | null) =>
  RoomSessionService.assertRoomSessionAvailable(session);

const generateGameCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

const publishStateForGame = async (server: RealtimeServer, gameCode: string) => {
  const playerIds = await GameRedisService.listPlayerIds(gameCode);
  RoomStatePublisher.publishRoomState(server, gameCode, playerIds);
};

const publishPlayerJoined = (
  server: RealtimeServer,
  gameCode: string,
  player: GamePlayerPresence,
) => {
  publishDisplayMessage(server as never, gameCode, {
    type: "display.player_joined",
    payload: player,
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

  await GameRedisService.withGameLock(input.gameCode, async () => {
    const meta = await RoomMetaService.getGameMetaOrThrow(input.gameCode);
    if (meta.status === "completed") {
      throw new ConflictException("This room is completed");
    }

    await GameRedisService.setPlayerRecord(input.gameCode, playerId, {
      id: playerId,
      displayName: input.displayName,
      joinedAt,
      sessionToken,
    });

    await GameRedisService.touchRoomKeys(input.gameCode);
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
  publishPlayerJoined(input.server, result.gameCode, result.player);
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
  const poolSeed = GamePoolService.createPoolSeed();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const gameCode = generateGameCode();
    const created = await RoomMetaService.createGameMeta({
      id: randomUUID(),
      code: gameCode,
      roomName,
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
      await GamePoolService.setPoolSeed({
        gameCode,
        seed: poolSeed,
      });
      await GameRedisService.touchRoomKeys(gameCode);
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
  GameRedisService.withGameLock(input.gameCode, async () => {
    const currentSettings = await GameSettingsService.getGameSettingsOrThrow(input.gameCode);
    const nextSettings = GameSettingsService.mergeGameSettings(
      currentSettings,
      input.settings,
    );

    await GameSettingsService.setGameSettings(input.gameCode, nextSettings);
    await GameRedisService.touchRoomKeys(input.gameCode);

    return GameSnapshotService.getGameMeta(input.gameCode);
  });

export const start = async (input: {
  gameCode: string;
  server: RealtimeServer;
}) =>
  GameRedisService.withGameLock(input.gameCode, async () => {
    const playerIds = await GameRedisService.listPlayerIds(input.gameCode);
    if (playerIds.length < 2) {
      throw new BadRequestException("Need at least 2 players to start");
    }

    const settings = await GameSettingsService.getGameSettingsOrThrow(input.gameCode);
    const movies = await GamePoolService.buildInitialPool({
      gameCode: input.gameCode,
      settings,
    });
    await GamePoolService.saveInitialPool(input.gameCode, movies);

    for (const playerId of playerIds) {
      await SwipeService.clearPlayerState(input.gameCode, playerId);
      await SwipeService.refillPlayerQueue(input.gameCode, playerId);
      await SwipeService.getCurrentOrNextMovie(input.gameCode, playerId);
    }

    const meta = await RoomMetaService.getGameMetaOrThrow(input.gameCode);
    await RoomMetaService.setGameMeta(input.gameCode, {
      ...meta,
      status: "swiping",
      endedAt: null,
    });
    await GameRedisService.touchRoomKeys(input.gameCode);

    return {
      gameCode: input.gameCode.trim().toUpperCase(),
    };
  }).then(async (result) => {
    await publishStateForGame(input.server, result.gameCode);
    return result;
  });

export const end = (input: {
  gameCode: string;
  displayId: string;
  sessionToken: string;
  server: RealtimeServer;
}) =>
  GameRedisService.withGameLock(input.gameCode, async () => {
    await RoomSessionService.verifyDisplaySession({
      gameCode: input.gameCode,
      displayId: input.displayId,
      sessionToken: input.sessionToken,
    });

    const playerIds = await GameRedisService.listPlayerIds(input.gameCode);
    const meta = await RoomMetaService.getGameMetaOrThrow(input.gameCode);
    const endedAt = new Date().toISOString();

    await RoomMetaService.setGameMeta(input.gameCode, {
      ...meta,
      status: "completed",
      endedAt,
    });
    await GameRedisService.touchRoomKeys(input.gameCode);

    publishDisplayMessage(input.server as never, input.gameCode, {
      type: "display.room_ended",
    });
    for (const playerId of playerIds) {
      publishPlayerMessage(input.server as never, input.gameCode, playerId, {
        type: "player.room_ended",
      });
    }

    await GameRedisService.deleteRoomKeys(input.gameCode);
    clearPresenceState(input.gameCode);
  });
