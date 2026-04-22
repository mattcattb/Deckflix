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
import {roomController} from "./rooms/room.controller";
import {roomsController} from "./rooms/rooms.controller";
import {settingsController} from "./settings/game-settings.controller";
import {tmdbController} from "./tmdb/tmdb.controller";
import {displayController} from "./display/display.controller";
import {swipeController} from "./swipe/swipe.controller";

export const protectedProjectsRoutes = createRouter().use("*", authMiddleware);

const baseApp = createRouter();
addGlobalMiddlewares(baseApp);
addGlobalErrorHandling(baseApp);

export const app = baseApp
  .route("/api/auth", authController)
  .route("/api/movies", moviesController)
  .route("/api/settings", settingsController)
  .route("/api/tmdb", tmdbController)
  .route("/api/rooms", roomsController)
  .route("/api/rooms/me", roomController)
  .route("/api/rooms/me/display", displayController)
  .route("/api/rooms/me/player", swipeController)
  .route("/api/room", roomController)
  .route("/api/display", displayController)
  .route("/api/swipe", swipeController);

export type ApiRoutesType = typeof protectedProjectsRoutes;
export type AppType = ApplyGlobalResponse<typeof app, GlobalErrorResponses>;
