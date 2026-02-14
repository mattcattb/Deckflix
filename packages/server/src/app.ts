import { addErrorHandling } from "./common/errors";
import { addGlobalMiddlewares, createRouter } from "./common/hono";
import { authController } from "./auth/auth.controller";
import { authMiddleware } from "./auth/auth.middleware";
import { moviesController } from "./movies/movies.controller";
import { projectsController } from "./projects/projects.controller";
import { roomsController } from "./rooms/rooms.controller";

export const protectedApiRoutes = createRouter()
  .use("*", authMiddleware)
  .route("/projects", projectsController);

const baseApp = createRouter();
addGlobalMiddlewares(baseApp);
addErrorHandling(baseApp);

export const app = baseApp
  .route("/api/auth", authController)
  .route("/api", protectedApiRoutes)
  .route("/api/movies", moviesController)
  .route("/api/rooms", roomsController);

export type ApiRoutesType = typeof protectedApiRoutes;
export type AppType = typeof app;
