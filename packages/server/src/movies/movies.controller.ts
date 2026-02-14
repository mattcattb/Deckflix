import { zValidator } from "@hono/zod-validator";
import { createRouter } from "../common/hono";
import { moviePopularQuerySchema, movieSearchQuerySchema } from "./movies.schema";
import { moviesService } from "./movies.service";

export const moviesController = createRouter()
  .get("/search", zValidator("query", movieSearchQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const result = await moviesService.searchMovies({
      query: query.q,
      page: query.page,
    });
    return c.json(result);
  })
  .get("/popular", zValidator("query", moviePopularQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const result = await moviesService.getPopularMovies({
      page: query.page,
    });
    return c.json(result);
  })
  .get("/:movieId", async (c) => {
    const movieId = c.req.param("movieId");
    const movie = await moviesService.getMovieById(movieId);
    return c.json(movie);
  });
