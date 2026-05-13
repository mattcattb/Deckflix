import {subscribeAppEvents, type AppEvent} from "../common/app-events";
import {
  publishDisplayMessage,
  publishPlayerMessage,
  publishRoomMessage,
  type RealtimeServer,
} from "./realtime.service";

let realtimeServer: RealtimeServer | null = null;
let subscribed = false;

const publishRealtimeEvent = (event: AppEvent) => {
  if (!realtimeServer) {
    return;
  }

  if (event.type === "player.joined") {
    publishDisplayMessage(realtimeServer, event.gameCode, event);
    return;
  }

  if (event.type === "player.left") {
    publishDisplayMessage(realtimeServer, event.gameCode, event);
    return;
  }

  if (event.type === "player.kicked") {
    publishDisplayMessage(realtimeServer, event.gameCode, event);
    publishPlayerMessage(
      realtimeServer,
      event.gameCode,
      event.playerId,
      event,
    );
    return;
  }

  if (event.type === "player.updated") {
    publishDisplayMessage(realtimeServer, event.gameCode, event);
    publishPlayerMessage(
      realtimeServer,
      event.gameCode,
      event.player.id,
      event,
    );
    return;
  }

  if (event.type === "player.connected") {
    publishDisplayMessage(realtimeServer, event.gameCode, event);
    return;
  }

  if (event.type === "player.disconnected") {
    publishDisplayMessage(realtimeServer, event.gameCode, event);
    return;
  }

  if (event.type === "room.status_changed") {
    publishRoomMessage(realtimeServer, event.gameCode, event);
    return;
  }

  if (event.type === "room.started") {
    publishRoomMessage(realtimeServer, event.gameCode, event);
    return;
  }

  if (event.type === "room.completed") {
    publishRoomMessage(realtimeServer, event.gameCode, event);
    return;
  }

  if (event.type === "room.deleted") {
    publishRoomMessage(realtimeServer, event.gameCode, event);
    return;
  }

  if (event.type === "game.vote_recorded") {
    publishDisplayMessage(realtimeServer, event.gameCode, event);
    publishPlayerMessage(
      realtimeServer,
      event.gameCode,
      event.playerId,
      event,
    );
    return;
  }

  if (event.type === "game.match_found") {
    publishDisplayMessage(realtimeServer, event.gameCode, event);
  }
};

export const ensureRealtimeDomainEventListener = (server: RealtimeServer) => {
  realtimeServer = server;

  if (subscribed) {
    return;
  }

  subscribeAppEvents(publishRealtimeEvent);
  subscribed = true;
};
