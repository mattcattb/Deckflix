import {upgradeWebSocket} from "hono/bun";

export const websocketMiddleware = upgradeWebSocket((c) => {
  return {
    onClose(evt, ws) {},

    onError(evt, ws) {},

    onMessage(evt, ws) {},

    onOpen(evt, ws) {},
  };
});
