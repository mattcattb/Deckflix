import { addErrorHandling } from "./common/errors";
import { addGlobalMiddlewares, createRouter } from "./common/hono";
import { authController } from "./auth/auth.controller";
import { authMiddleware } from "./auth/auth.middleware";
import { moviesController } from "./movies/movies.controller";
import { projectsController } from "./projects/projects.controller";
import { roomsController } from "./rooms/rooms.controller";

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
  .route("/api/rooms", roomsController);

export type ApiRoutesType = typeof protectedProjectsRoutes;
export type AppType = typeof app;
