import {getBunServer, upgradeWebSocket} from "hono/bun";
import {
  decodeDisplayClientMessage,
  encodeDisplayServerMessage,
} from "@deckflix/shared";
import {ensureSocketPubSub} from "../lib/redis";
import * as DisplayService from "./display.service";
import * as GamePresenceService from "../ws/presence.ws";

export const createDisplaySocketHandler = () =>
  upgradeWebSocket((c) => {
    const {gameCode} = c.get("room");
    const {displayId, sessionToken} = c.get("displayActor");
    const server = getBunServer<Parameters<typeof ensureSocketPubSub>[0]>(c)!;
    void ensureSocketPubSub(server);

    return {
      onOpen: (_, ws) => {
        void GamePresenceService.connectDisplay({
          gameCode,
          displayId,
          sessionToken,
          socket: ws,
        })
          .then(async () => {
            ws.send(encodeDisplayServerMessage({
              type: "display.snapshot",
              payload: await DisplayService.getDisplayState(gameCode),
            }));
            DisplayService.publishDisplayRoomState(server, gameCode);
            GamePresenceService.subscribeDisplaySocket(ws, gameCode);
          })
          .catch(() => {
            ws.close(4001, "Invalid display session");
          });
      },
      onClose: (_, ws) => {
        GamePresenceService.unsubscribeDisplaySocket(ws, gameCode);
        GamePresenceService.disconnectDisplay({
          gameCode,
          socket: ws,
        });
        DisplayService.publishDisplayRoomState(server, gameCode);
      },
      onMessage: (event, ws) => {
        try {
          const parsed = decodeDisplayClientMessage(event.data as string);
          if (parsed.type === "ping") {
            ws.send(encodeDisplayServerMessage({type: "pong"}));
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : "Invalid websocket message";
          ws.send(encodeDisplayServerMessage({
            type: "display.error",
            payload: {message},
          }));
        }
      },
    };
  });
