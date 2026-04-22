import * as GameSnapshotService from "../games/game-snapshot.service";
import * as GameRedisService from "../games/game-redis.service";
import {publishGameState} from "../games/game-state.pubsub";
import type {RealtimeServer} from "../realtime/socket-bus";

export const getDisplayState = (gameCode: string) =>
  GameSnapshotService.getDisplayGameState(gameCode);

export const publishDisplayRoomState = async (
  server: RealtimeServer,
  gameCode: string,
) => {
  const playerIds = await GameRedisService.listPlayerIds(gameCode);
  publishGameState(server, gameCode, playerIds);
};
