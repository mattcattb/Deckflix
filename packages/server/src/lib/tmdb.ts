import {TMDB, type AvailableLanguage} from "tmdb-ts";
import {appEnv} from "../common/env";
import {ServiceException} from "../common/errors";
import {redisClient} from "../redis/redis";

export type TmdbImageConfiguration = {
  secureBaseUrl: string;
  posterSizes: string[];
  backdropSizes: string[];
};

export type TmdbMovieImages = {
  movieId: string;
  posterUrl: string | null;
  backdropUrl: string | null;
  posterOptions: string[];
  backdropOptions: string[];
};

const TMDB_CONFIGURATION_CACHE_TTL_SECONDS = 60 * 60 * 24 * 7;

const defaultImageConfiguration: TmdbImageConfiguration = {
  secureBaseUrl: appEnv.TMDB_IMAGE_BASE_URL.replace(/\/w\d+$/, "/"),
  posterSizes: ["w92", "w154", "w185", "w342", "w500", "w780", "original"],
  backdropSizes: ["w300", "w780", "w1280", "original"],
};

let tmdbClient: TMDB | null = null;

const ensureTmdbConfigured = () => {
  if (!appEnv.TMDB_API_KEY) {
    throw new ServiceException("TMDB is not configured");
  }
};

export const getTmdbClient = () => {
  ensureTmdbConfigured();
  if (!tmdbClient) {
    tmdbClient = new TMDB(appEnv.TMDB_API_KEY!);
  }
  return tmdbClient;
};

const handleTmdbError = (error: unknown, fallbackMessage: string): never => {
  if (
    typeof error === "object" &&
    error !== null &&
    "status_message" in error &&
    typeof error.status_message === "string"
  ) {
    throw new ServiceException(error.status_message);
  }

  if (error instanceof Error) {
    throw new ServiceException(error.message || fallbackMessage);
  }

  throw new ServiceException(fallbackMessage);
};

const configurationCacheKey = () => "tmdb:configuration";

const toTmdbLanguage = (language?: string) =>
  (language ?? "en-US") as AvailableLanguage;

const chooseTmdbImageSize = (
  availableSizes: string[],
  preferredSizes: string[],
) =>
  preferredSizes.find((size) => availableSizes.includes(size)) ??
  availableSizes.at(-1) ??
  "original";

const buildTmdbImageUrlFromConfiguration = (
  configuration: TmdbImageConfiguration,
  path: string | null | undefined,
  size: string,
) => (path ? `${configuration.secureBaseUrl}${size}${path}` : null);

export const buildTmdbImageUrl = (
  path: string | null | undefined,
  size = "w500",
) =>
  buildTmdbImageUrlFromConfiguration(defaultImageConfiguration, path, size);

export const getTmdbImageConfiguration =
  async (): Promise<TmdbImageConfiguration> => {
    const cached = await redisClient.get(configurationCacheKey());
    if (cached) {
      return JSON.parse(cached.toString()) as TmdbImageConfiguration;
    }

    try {
      const response = await getTmdbClient().configuration.getApiConfiguration();
      const configuration: TmdbImageConfiguration = {
        secureBaseUrl:
          response.images.secure_base_url ||
          defaultImageConfiguration.secureBaseUrl,
        posterSizes:
          response.images.poster_sizes.length > 0
            ? response.images.poster_sizes
            : defaultImageConfiguration.posterSizes,
        backdropSizes:
          response.images.backdrop_sizes.length > 0
            ? response.images.backdrop_sizes
            : defaultImageConfiguration.backdropSizes,
      };

      await redisClient.set(configurationCacheKey(), JSON.stringify(configuration), {
        EX: TMDB_CONFIGURATION_CACHE_TTL_SECONDS,
      });

      return configuration;
    } catch (error) {
      return handleTmdbError(error, "TMDB configuration request failed");
    }
  };

export const getTmdbMovieImages = async (
  movieId: string,
  language = "en-US",
): Promise<TmdbMovieImages> => {
  try {
    const tmdb = getTmdbClient();
    const [movie, images, configuration] = await Promise.all([
      tmdb.movies.details(Number(movieId), undefined, language),
      tmdb.movies.images(Number(movieId), {
        language: toTmdbLanguage(language),
        include_image_language: [language, "null"],
      }),
      getTmdbImageConfiguration(),
    ]);
    const posterSize = chooseTmdbImageSize(configuration.posterSizes, [
      "w500",
      "w342",
      "original",
    ]);
    const backdropSize = chooseTmdbImageSize(configuration.backdropSizes, [
      "w1280",
      "w780",
      "original",
    ]);

    return {
      movieId,
      posterUrl: buildTmdbImageUrlFromConfiguration(
        configuration,
        movie.poster_path,
        posterSize,
      ),
      backdropUrl: buildTmdbImageUrlFromConfiguration(
        configuration,
        movie.backdrop_path,
        backdropSize,
      ),
      posterOptions: images.posters
        .map((item) =>
          buildTmdbImageUrlFromConfiguration(
            configuration,
            item.file_path,
            posterSize,
          ),
        )
        .filter(Boolean) as string[],
      backdropOptions: images.backdrops
        .map((item) =>
          buildTmdbImageUrlFromConfiguration(
            configuration,
            item.file_path,
            backdropSize,
          ),
        )
        .filter(Boolean) as string[],
    };
  } catch (error) {
    return handleTmdbError(error, "TMDB movie images request failed");
  }
};

export const isTmdbConfigured = () => Boolean(appEnv.TMDB_API_KEY);
