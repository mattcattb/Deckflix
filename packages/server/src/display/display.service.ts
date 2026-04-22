import * as GamePresenceService from "../ws/presence.ws";
import * as GameSnapshotService from "../games/game-snapshot.service";
import * as GameStateService from "../games/game-state.service";

type RealtimeServer = {publish: (topic: string, payload: string) => void};

export const getDisplayState = (gameCode: string) =>
  GameSnapshotService.getDisplayGameState(gameCode);

export const publishDisplayRoomState = async (
  server: RealtimeServer,
  gameCode: string,
) => {
  const playerIds = await GameStateService.getGamePlayerIds(gameCode);
  GamePresenceService.publishRoomState(server, gameCode, playerIds);
};

export const openDisplayConnection = GamePresenceService.connectDisplay;
export const closeDisplayConnection = GamePresenceService.disconnectDisplay;
export const subscribeDisplaySocket = GamePresenceService.subscribeDisplaySocket;
export const unsubscribeDisplaySocket = GamePresenceService.unsubscribeDisplaySocket;
