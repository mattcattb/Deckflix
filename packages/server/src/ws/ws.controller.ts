import {upgradeWebSocket} from "hono/bun";
import {
  decodeDisplayClientMessage,
  decodePlayerClientMessage,
  encodeDisplayServerMessage,
  encodePlayerServerMessage,
} from "@deckflix/shared";
import {createRouter} from "../common/hono";
import * as PresenceService from "../presence/presence.service";
import * as RealtimeService from "../realtime/realtime.service";
import {getProjectedPlayerState} from "../rooms/game-state.service";
import {activeRoomMiddleware} from "../rooms/rooms.middleware";

const createSocketHandler = () =>
  upgradeWebSocket((c) => {
    const {gameCode, session} = c.get("room");

    if (session?.role === "display") {
      return {
        onOpen: (_, ws) => {
          void (async () => {
            try {
              RealtimeService.subscribeDisplaySocket(ws, gameCode);
            } catch {
              ws.close(4001, "Invalid display session");
            }
          })();
        },
        onClose: (_, ws) => {
          RealtimeService.unsubscribeDisplaySocket(ws, gameCode);
        },
        onMessage: (event, ws) => {
          try {
            const parsed = decodeDisplayClientMessage(event.data as string);
            if (parsed.type === "socket.ping") {
              ws.send(encodeDisplayServerMessage({type: "socket.pong"}));
            }
          } catch (error) {
            const message =
              error instanceof Error
                ? error.message
                : "Invalid websocket message";
            ws.send(
              encodeDisplayServerMessage({
                type: "socket.error",
                payload: {message},
              }),
            );
          }
        },
      };
    }

    const playerId = session?.roleId ?? "";

    return {
      onOpen: (_, ws) => {
        void (async () => {
          try {
            await PresenceService.connectPlayer({
              gameCode,
              playerId,
            });
            ws.send(
              encodePlayerServerMessage({
                type: "player.snapshot",
                payload: await getProjectedPlayerState({gameCode, playerId}),
              }),
            );
            RealtimeService.subscribePlayerSocket(ws, gameCode, playerId);
          } catch {
            ws.close(4001, "Invalid player session");
          }
        })();
      },
      onClose: (_, ws) => {
        RealtimeService.unsubscribePlayerSocket(ws, gameCode, playerId);
        void PresenceService.disconnectPlayer({gameCode, playerId}).catch(
          () => undefined,
        );
      },
      onMessage: (event, ws) => {
        try {
          const parsed = decodePlayerClientMessage(event.data as string);
          if (parsed.type === "socket.ping") {
            ws.send(encodePlayerServerMessage({type: "socket.pong"}));
          }
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Invalid websocket message";
          ws.send(
            encodePlayerServerMessage({
              type: "socket.error",
              payload: {message},
            }),
          );
        }
      },
    };
  });

export const wsController = createRouter()
  .use("*", activeRoomMiddleware)
  .get("/", createSocketHandler());
