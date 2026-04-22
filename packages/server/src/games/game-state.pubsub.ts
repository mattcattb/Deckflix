import type {DisplayGameState, PlayerGameState} from "@deckflix/shared";
import {publishDisplayMessage} from "../realtime/display-channel";
import {publishPlayerMessage} from "../realtime/player-channel";
import type {RealtimeServer} from "../realtime/socket-bus";
import {ensureRedis, redis} from "../lib/redis";
import * as GameRedisService from "./game-redis.service";
import * as GameSnapshotService from "./game-snapshot.service";

const displayProjectionKey = (gameCode: string) =>
  `game:${GameRedisService.normalizeGameCode(gameCode)}:projection:display`;

const playerProjectionKey = (gameCode: string, playerId: string) =>
  `game:${GameRedisService.normalizeGameCode(gameCode)}:projection:player:${playerId}`;

const parseProjection = <T>(raw: string | null): T | null => {
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
};

export const getProjectedDisplayState = async (gameCode: string) => {
  await ensureRedis();
  const cached = parseProjection<DisplayGameState>(
    await redis.get(displayProjectionKey(gameCode)),
  );
  if (cached) {
    return cached;
  }

  const state = await GameSnapshotService.getDisplayGameState(gameCode);
  await redis.set(displayProjectionKey(gameCode), JSON.stringify(state));
  return state;
};

export const getProjectedPlayerState = async (input: {
  gameCode: string;
  playerId: string;
}) => {
  await ensureRedis();
  const cached = parseProjection<PlayerGameState>(
    await redis.get(playerProjectionKey(input.gameCode, input.playerId)),
  );
  if (cached) {
    return cached;
  }

  const state = await GameSnapshotService.getPlayerGameState(input);
  await redis.set(
    playerProjectionKey(input.gameCode, input.playerId),
    JSON.stringify(state),
  );
  return state;
};

export const materializeGameState = async (gameCode: string, playerIds: string[]) => {
  const [displayState, playerEntries] = await Promise.all([
    GameSnapshotService.getDisplayGameState(gameCode),
    Promise.all(
      playerIds.map(async (playerId) => [
        playerId,
        await GameSnapshotService.getPlayerGameState({gameCode, playerId}),
      ] as const),
    ),
  ]);

  await ensureRedis();
  const multi = redis.multi();
  multi.set(displayProjectionKey(gameCode), JSON.stringify(displayState));
  for (const [playerId, state] of playerEntries) {
    multi.set(playerProjectionKey(gameCode, playerId), JSON.stringify(state));
  }
  await multi.exec();

  return {
    displayState,
    playerStates: new Map(playerEntries),
  };
};

export const publishGameState = async (
  server: RealtimeServer,
  gameCode: string,
  playerIds: string[],
) => {
  const materialized = await materializeGameState(gameCode, playerIds);

  publishDisplayMessage(server, gameCode, {
    type: "display.snapshot",
    payload: materialized.displayState,
  });

  for (const [playerId, state] of materialized.playerStates) {
    publishPlayerMessage(server, gameCode, playerId, {
      type: "player.snapshot",
      payload: state,
    });
  }

  return materialized;
};
