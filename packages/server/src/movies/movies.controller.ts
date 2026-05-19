import {z} from "zod";
import {zValidator} from "@hono/zod-validator";
import {createRouter} from "../common/hono";
import {
  buildTmdbImageUrl,
  getTmdbImageConfiguration,
  getTmdbMovieImages,
  isTmdbConfigured,
} from "../lib/tmdb";
import {
  getTmdbMovieDetails,
  type TmdbMovieDetailsWithAppends,
  getTmdbMovieGenres,
  getTmdbMovieProviders,
  getTmdbPopularMovies,
  searchTmdbMovies,
  toTmdbLanguage,
} from "./tmdb.service";
import {toMovieCandidateFromTmdb} from "./movie-normalizer";

const movieSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});

const moviePopularQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});

const movieDetailsQuerySchema = z.object({
  language: z.string().trim().min(2).max(10).optional().default("en-US"),
  region: z.string().trim().length(2).toUpperCase().optional().default("US"),
});

const movieCatalogQuerySchema = z.object({
  language: z.string().trim().min(2).max(10).optional().default("en-US"),
  region: z.string().trim().length(2).toUpperCase().optional().default("US"),
});

type WatchProviderCatalogItem = {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
};

const toWatchProviderList = (providers?: WatchProviderCatalogItem[]) =>
  providers?.map((provider) => ({
    id: provider.provider_id,
    name: provider.provider_name,
    logoUrl: buildTmdbImageUrl(provider.logo_path),
  })) ?? [];

const toWatchProviderAvailability = (
  movie: TmdbMovieDetailsWithAppends,
  region: string,
) => {
  const watchProviderCatalog = movie["watch/providers"] as
    | {
        results?: Record<
          string,
          | {
              link?: string | null;
              flatrate?: WatchProviderCatalogItem[];
              rent?: WatchProviderCatalogItem[];
              buy?: WatchProviderCatalogItem[];
            }
          | undefined
        >;
      }
    | undefined;
  const availability =
    watchProviderCatalog?.results?.[region] ??
    watchProviderCatalog?.results?.US;

  return {
    region,
    link: availability?.link,
    stream: toWatchProviderList(availability?.flatrate),
    rent: toWatchProviderList(availability?.rent),
    buy: toWatchProviderList(availability?.buy),
  };
};

const toContentRating = (
  movie: TmdbMovieDetailsWithAppends,
  region: string,
) => {
  const releaseRegion = movie.release_dates?.results?.find(
    (releaseRegion) => releaseRegion.iso_3166_1 === region,
  );
  const fallbackRegion = movie.release_dates?.results?.find(
    (releaseRegion) => releaseRegion.iso_3166_1 === "US",
  );
  const releaseDates =
    releaseRegion?.release_dates ?? fallbackRegion?.release_dates ?? [];

  const prioritized = releaseDates.find(
    (release) =>
      release.certification &&
      (release.type === 1 || release.type === 2 || release.type === 3 || release.type === 4),
  )?.certification;

  return (
    prioritized ??
    releaseDates.find((release) => release.certification)?.certification
  );
};

export const moviesController = createRouter()
  .get("/tmdb/status", async (c) =>
    c.json({
      configured: isTmdbConfigured(),
    }),
  )
  .get("/tmdb/configuration", async (c) =>
    c.json(await getTmdbImageConfiguration()),
  )
  .get(
    "/tmdb/watch-providers",
    zValidator("query", movieCatalogQuerySchema),
    async (c) => {
      const query = c.req.valid("query");
      const providers = await getTmdbMovieProviders({
        region: query.region,
        language: toTmdbLanguage(query.language),
      });

      return c.json({
        items: providers.results
          .sort(
            (left, right) =>
              left.display_priority - right.display_priority ||
              left.provider_name.localeCompare(right.provider_name),
          )
          .map((provider) => ({
            id: provider.provider_id,
            name: provider.provider_name,
            logoUrl: buildTmdbImageUrl(provider.logo_path),
          })),
      });
    },
  )
  .get(
    "/tmdb/movie-genres",
    zValidator("query", movieCatalogQuerySchema),
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
      items: result.results.map(toMovieCandidateFromTmdb),
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
      items: result.results.map(toMovieCandidateFromTmdb),
    });
  })
  .get("/:movieId", zValidator("query", movieDetailsQuerySchema), async (c) => {
    const query = c.req.valid("query");
    const movieId = c.req.param("movieId");
    const movie = await getTmdbMovieDetails(
      movieId,
      toTmdbLanguage(query.language),
    );

    const watchProviders = toWatchProviderAvailability(movie, query.region);
    const contentRating = toContentRating(movie, query.region);

    return c.json({
      ...toMovieCandidateFromTmdb(movie),
      backdropUrl: buildTmdbImageUrl(movie.backdrop_path, "w1280") ?? "",
      releaseDate: movie.release_date,
      runtimeMinutes: movie.runtime,
      genres: movie.genres.map((genre) => genre.name),
      tagline: movie.tagline,
      voteCount: movie.vote_count,
      popularity: movie.popularity,
      contentRating,
      watchProviders,
    });
  });
