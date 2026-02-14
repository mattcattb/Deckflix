import { websocket } from "hono/bun";
import { appEnv } from "./common/env";
import { logger } from "./common/logger";
import { app } from "./app";
export { app, protectedApiRoutes } from "./app";
export type { AppType, ApiRoutesType } from "./app";

const port = appEnv.PORT;
logger.info(`Server running on http://localhost:${port}`);

export default {
  port,
  fetch: app.fetch,
  websocket,
};
