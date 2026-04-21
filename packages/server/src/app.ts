import { addErrorHandling } from "./common/errors";
import { addGlobalMiddlewares, createRouter } from "./common/hono";
import { authController } from "./auth/auth.controller";
import { authMiddleware } from "./auth/auth.middleware";
import { gamesController } from "./games/games.controller";
import { moviesController } from "./movies/movies.controller";
import { projectsController } from "./projects/projects.controller";

export const protectedProjectsRoutes = createRouter()
  .use("*", authMiddleware)
  .route("/", projectsController);

const baseApp = createRouter();
addGlobalMiddlewares(baseApp);
addErrorHandling(baseApp);

export const app = baseApp
  .route("/api/auth", authController)
  .route("/api/projects", protectedProjectsRoutes)
  .route("/api/movies", moviesController)
  .route("/api/games", gamesController);

export type ApiRoutesType = typeof protectedProjectsRoutes;
export type AppType = typeof app;
