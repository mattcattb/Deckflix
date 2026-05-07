import {websocket} from "hono/bun";
import {appEnv} from "./common/env";
import {logger} from "./common/logger";
import {app} from "./app";
import {ensureSocketPubSub} from "./realtime/socket-pubsub.service";
export {app, protectedProjectsRoutes} from "./app";
export type {AppType, ApiRoutesType} from "./app";

const port = appEnv.PORT;
logger.info(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch(request: Request, server?: unknown) {
    if (server) {
      void ensureSocketPubSub(
        server as Parameters<typeof ensureSocketPubSub>[0],
      );
    }
    return app.fetch(request, server);
  },
  websocket,
};
