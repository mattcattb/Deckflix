import { zValidator } from "@hono/zod-validator";
import { createRouter } from "../common/hono";
import * as MoviesService from "./movies.service";

export const moviesController = createRouter()
  .get("/search", zValidator("query", MoviesService.movieSearchQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const result = await MoviesService.searchMovies({
      query: query.q,
      page: query.page,
    });
    return c.json(result);
  })
  .get("/popular", zValidator("query", MoviesService.moviePopularQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const result = await MoviesService.getPopularMovies({
      page: query.page,
    });
    return c.json(result);
  })
  .get("/:movieId", zValidator("query", MoviesService.movieDetailsQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const movieId = c.req.param("movieId");
    const movie = await MoviesService.getMovieById(movieId, {
      language: query.language,
      region: query.region,
    });
    return c.json(movie);
  });
