import {
  addGlobalErrorHandling,
  addGlobalMiddlewares,
  createRouter,
} from "./common/hono";
import {authController} from "./auth/auth.controller";
import {authMiddleware} from "./auth/auth.middleware";
import {gamesController} from "./games/games.controller";
import {moviesController} from "./movies/movies.controller";
import {roomsController} from "./rooms/rooms.controller";
import {settingsController} from "./settings/game-settings.controller";
import {tmdbController} from "./tmdb/tmdb.controller";

export const protectedProjectsRoutes = createRouter().use("*", authMiddleware);

const baseApp = createRouter();
addGlobalMiddlewares(baseApp);
addGlobalErrorHandling(baseApp);

export const app = baseApp
  .route("/api/auth", authController)
  .route("/api/movies", moviesController)
  .route("/api/settings", settingsController)
  .route("/api/tmdb", tmdbController)
  .route("/api/games", gamesController)
  .route("/api/rooms", roomsController);

export type ApiRoutesType = typeof protectedProjectsRoutes;
export type AppType = typeof app;
