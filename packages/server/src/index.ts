import {websocket} from "hono/bun";
import {appEnv} from "./common/env";
import {logger} from "./common/logger";
import {app} from "./app";
import {ensureGameEventListener} from "./gameplay/game-event-listener";
import {connectRedis} from "./redis/redis";
import {ensureRealtimeDomainEventListener} from "./realtime/domain-event-listener";
import {ensureSocketPubSub} from "./realtime/socket-pubsub.service";
import {ensurePoolEventListener} from "./pool/pool-event-listener";
export {app, protectedProjectsRoutes} from "./app";
export type {AppType, ApiRoutesType} from "./app";

const port = appEnv.PORT;
await connectRedis();
logger.info(`Server running on http://localhost:${port}`);

const ensureServerListeners = (
  server: Parameters<typeof ensureSocketPubSub>[0],
) => {
  void ensureSocketPubSub(server);
  ensureRealtimeDomainEventListener(server);
  ensureGameEventListener();
  ensurePoolEventListener();
};

export default {
  port,
  fetch(request: Request, server?: unknown) {
    if (server) {
      ensureServerListeners(server as Parameters<typeof ensureSocketPubSub>[0]);
    }
    return app.fetch(request, server);
  },
  websocket,
};
