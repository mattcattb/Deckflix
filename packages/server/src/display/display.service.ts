import * as GameSnapshotService from "../games/game-snapshot.service";
import * as GameRedisService from "../games/game-redis.service";
import * as RoomStatePublisher from "../ws/room-state-publisher";

type RealtimeServer = {publish: (topic: string, payload: string) => void};

export const getDisplayState = (gameCode: string) =>
  GameSnapshotService.getDisplayGameState(gameCode);

export const publishDisplayRoomState = async (
  server: RealtimeServer,
  gameCode: string,
) => {
  const playerIds = await GameRedisService.listPlayerIds(gameCode);
  RoomStatePublisher.publishRoomState(server, gameCode, playerIds);
};
