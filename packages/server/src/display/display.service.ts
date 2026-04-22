import * as GamePresenceService from "../games/game-presence.service";
import {getDisplayGameState} from "../games/game-snapshot.service";
import {getGamePlayerIds} from "../games/game-state.service";

type RealtimeServer = {publish: (topic: string, payload: string) => void};

export const getDisplayState = (gameCode: string) => getDisplayGameState(gameCode);

export const publishDisplayRoomState = async (
  server: RealtimeServer,
  gameCode: string,
) => {
  const playerIds = await getGamePlayerIds(gameCode);
  GamePresenceService.publishRoomState(server, gameCode, playerIds);
};

export const openDisplayConnection = GamePresenceService.connectDisplay;
export const closeDisplayConnection = GamePresenceService.disconnectDisplay;
export const subscribeDisplaySocket = GamePresenceService.subscribeDisplaySocket;
export const unsubscribeDisplaySocket = GamePresenceService.unsubscribeDisplaySocket;
