import type {GamePlayerPresence, PlayerSession} from "@deckflix/shared";
import * as GameSnapshotService from "../games/game-snapshot.service";
import * as PoolGeneratorService from "../pool/pool-generator.service";
import * as PoolService from "../pool/pool.service";
import {BadRequestException, ConflictException} from "../common/errors";
import {randomUUID} from "node:crypto";
import {clearPresenceState} from "../ws/presence.ws";
import {publishGameState} from "../games/game-state.pubsub";
import * as GameSettingsService from "../settings/game-settings.service";
import * as RoomLifecycleService from "./room-lifecycle.service";
import * as RoomMetaService from "./room-meta.service";
import * as RoomPlayersService from "./room-players.service";
import * as RoomSessionService from "./room-session.service";
import {
  publishRoomDeleted,
  publishRoomStarted,
  publishRoomStatusChanged,
} from "./rooms.pubsub";
import type {RealtimeServer} from "../realtime/socket-bus";
import * as DeckService from "../swipe/deck.service";
import {publishPlayerJoined, publishPlayerLeft} from "../ws/presence.pubsub";

const generateGameCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 4; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

const publishStateForGame = async (server: RealtimeServer, gameCode: string) => {
  const playerIds = await RoomPlayersService.listPlayerIds(gameCode);
  await publishGameState(server, gameCode, playerIds);
};

const removePlayerState = async (gameCode: string, playerId: string) => {
  await Promise.all([
    DeckService.clearPlayerDeck(gameCode, playerId),
    RoomPlayersService.deletePlayerRecord(gameCode, playerId),
  ]);
};

export const removePlayer = async (input: {
  gameCode: string;
  playerId: string;
  server: RealtimeServer;
}) => {
  await RoomLifecycleService.withRoomLock(input.gameCode, async () => {
    await removePlayerState(input.gameCode, input.playerId);
  });

  const gameCode = RoomLifecycleService.normalizeGameCode(input.gameCode);
  publishPlayerLeft(input.server, gameCode, input.playerId);
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
  await RoomSessionService.verifyPlayerSession(input.player);
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

  await RoomLifecycleService.withRoomLock(input.gameCode, async () => {
    const meta = await RoomMetaService.getGameMetaOrThrow(input.gameCode);
    if (meta.status === "completed") {
      throw new ConflictException("This room is completed");
    }

    await RoomPlayersService.setPlayerRecord(input.gameCode, playerId, {
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
  const poolSeed = PoolGeneratorService.createPoolSeed();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const gameCode = generateGameCode();
    const created = await RoomMetaService.createGameMeta({
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
  RoomLifecycleService.withRoomLock(input.gameCode, async () => {
    const currentSettings = await GameSettingsService.getGameSettingsOrThrow(input.gameCode);
    const nextSettings = GameSettingsService.mergeGameSettings(
      currentSettings,
      input.settings,
    );

    await GameSettingsService.setGameSettings(input.gameCode, nextSettings);

    return GameSnapshotService.getGameMeta(input.gameCode);
  });

export const start = async (input: {
  gameCode: string;
  server: RealtimeServer;
}) =>
  RoomLifecycleService.withRoomLock(input.gameCode, async () => {
    const playerIds = await RoomPlayersService.listPlayerIds(input.gameCode);
    if (playerIds.length < 2) {
      throw new BadRequestException("Need at least 2 players to start");
    }

    const settings = await GameSettingsService.getGameSettingsOrThrow(input.gameCode);
    const movies = await PoolGeneratorService.generatePool({
      gameCode: input.gameCode,
      settings,
    });
    await PoolService.savePool(input.gameCode, movies);

    await DeckService.initializePlayerDecks(
      input.gameCode,
      playerIds,
      movies.length,
    );

    const meta = await RoomMetaService.getGameMetaOrThrow(input.gameCode);
    const previousStatus = meta.status;
    await RoomMetaService.setGameMeta(input.gameCode, {
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
  RoomLifecycleService.withRoomLock(input.gameCode, async () => {
    await RoomSessionService.verifyDisplaySession({
      gameCode: input.gameCode,
      displayId: input.displayId,
      sessionToken: input.sessionToken,
    });

    const playerIds = await RoomPlayersService.listPlayerIds(input.gameCode);
    const meta = await RoomMetaService.getGameMetaOrThrow(input.gameCode);
    const endedAt = new Date().toISOString();
    const previousStatus = meta.status;

    await RoomMetaService.setGameMeta(input.gameCode, {
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

    await RoomLifecycleService.deleteRoomKeys(input.gameCode);
    clearPresenceState(input.gameCode);
  });
