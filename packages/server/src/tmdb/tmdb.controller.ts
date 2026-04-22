import {zValidator} from "@hono/zod-validator";
import {z} from "zod";
import {createRouter} from "../common/hono";
import {
  getTmdbImageConfiguration,
  getTmdbMovieGenres,
  getTmdbMovieImages,
  isTmdbConfigured,
} from "../lib/tmdb";

const tmdbLanguageQuerySchema = z.object({
  language: z.string().trim().min(2).max(10).optional().default("en-US"),
});

export const tmdbController = createRouter()
  .get("/status", async (c) =>
    c.json({
      configured: isTmdbConfigured(),
    }))
  .get("/configuration", async (c) => c.json(await getTmdbImageConfiguration()))
  .get("/movie-genres", zValidator("query", tmdbLanguageQuerySchema), async (c) => {
    const query = c.req.valid("query");
    return c.json({
      items: await getTmdbMovieGenres(query.language),
    });
  })
  .get("/movies/:movieId/images", zValidator("query", tmdbLanguageQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const movieId = c.req.param("movieId");
    return c.json(await getTmdbMovieImages(movieId, query.language));
  });
