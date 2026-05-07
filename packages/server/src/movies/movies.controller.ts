import {zValidator} from "@hono/zod-validator";
import {z} from "zod";
import {createRouter} from "../common/hono";
import {
  buildTmdbImageUrl,
  getTmdbImageConfiguration,
  getTmdbMovieImages,
  isTmdbConfigured,
} from "../lib/tmdb";
import {
  getTmdbMovieDetails,
  getTmdbMovieGenres,
  getTmdbPopularMovies,
  searchTmdbMovies,
  toTmdbLanguage,
} from "./tmdb.service";

const movieSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});

const moviePopularQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});

const movieDetailsQuerySchema = z.object({
  language: z.string().trim().min(2).max(10).optional().default("en-US"),
});

const toYear = (releaseDate?: string | null) => {
  if (!releaseDate) return 0;
  const year = Number(releaseDate.slice(0, 4));
  return Number.isNaN(year) ? 0 : year;
};

const toMovieSummary = (movie: {
  id: number;
  title: string;
  release_date?: string | null;
  overview?: string | null;
  poster_path?: string | null;
  vote_average?: number | null;
}) => ({
  id: String(movie.id),
  title: movie.title,
  year: toYear(movie.release_date),
  overview: movie.overview ?? "",
  posterUrl: buildTmdbImageUrl(movie.poster_path) ?? "",
  rating: Number(movie.vote_average?.toFixed(1) ?? 0),
});

export const moviesController = createRouter()
  .get("/tmdb/status", async (c) =>
    c.json({
      configured: isTmdbConfigured(),
    }))
  .get("/tmdb/configuration", async (c) =>
    c.json(await getTmdbImageConfiguration()))
  .get(
    "/tmdb/movie-genres",
    zValidator("query", movieDetailsQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      return c.json({
        items: await getTmdbMovieGenres({
          language: toTmdbLanguage(query.language),
        }),
      });
    },
  )
  .get(
    "/tmdb/movies/:movieId/images",
    zValidator("query", movieDetailsQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const movieId = c.req.param("movieId");
      return c.json(await getTmdbMovieImages(movieId, query.language));
    },
  )
  .get("/search", zValidator("query", movieSearchQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const result = await searchTmdbMovies({
      query: query.q,
      page: query.page,
    });
    return c.json({
      query: query.q,
      page: result.page,
      totalPages: result.total_pages,
      totalResults: result.total_results,
      items: result.results.map(toMovieSummary),
    });
  })
  .get("/popular", zValidator("query", moviePopularQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const result = await getTmdbPopularMovies({
      page: query.page,
    });
    return c.json({
      page: result.page,
      totalPages: result.total_pages,
      totalResults: result.total_results,
      items: result.results.map(toMovieSummary),
    });
  })
  .get("/:movieId", zValidator("query", movieDetailsQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const movieId = c.req.param("movieId");
    const movie = await getTmdbMovieDetails(
      movieId,
      toTmdbLanguage(query.language),
    );
    return c.json({
      ...toMovieSummary(movie),
      backdropUrl: buildTmdbImageUrl(movie.backdrop_path, "w1280") ?? "",
      releaseDate: movie.release_date,
      runtimeMinutes: movie.runtime,
      genres: movie.genres.map((genre) => genre.name),
      tagline: movie.tagline,
      status: movie.status,
      originalTitle: movie.original_title,
      originalLanguage: movie.original_language,
      voteCount: movie.vote_count,
      popularity: movie.popularity,
      homepage: movie.homepage,
      imdbId: movie.imdb_id,
    });
  });
