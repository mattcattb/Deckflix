import type {ApplyGlobalResponse} from "hono/client";
import {
  addGlobalErrorHandling,
  addGlobalMiddlewares,
  createRouter,
} from "./common/hono";
import type {GlobalErrorResponses} from "./common/errors";
import {authController} from "./auth/auth.controller";
import {authMiddleware} from "./auth/auth.middleware";
import {moviesController} from "./movies/movies.controller";
import {playerController} from "./players/player.controller";
import {roomController} from "./rooms/room.controller";
import {gameController} from "./gameplay/game.controller";
import {wsController} from "./ws/ws.controller";

export const protectedProjectsRoutes = createRouter().use("*", authMiddleware);

const baseApp = createRouter();
addGlobalMiddlewares(baseApp);
addGlobalErrorHandling(baseApp);

export const app = baseApp
  .route("/api/auth", authController)
  .route("/api/movies", moviesController)
  .route("/api/player", playerController)
  .route("/api/room", roomController)
  .route("/api/game", gameController)
  .route("/api/ws", wsController);

export type ApiRoutesType = typeof protectedProjectsRoutes;
export type AppType = ApplyGlobalResponse<typeof app, GlobalErrorResponses>;
