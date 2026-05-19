import {queryOptions} from "@tanstack/react-query";
import {api, parseRpc} from "../../lib/api";

const movieCatalogKeys = {
  genres: (language = "en-US") => ["movie-catalog", "genres", language] as const,
  watchProviders: (region = "US", language = "en-US") =>
    ["movie-catalog", "watch-providers", region, language] as const,
  details: (movieId: string, language = "en-US", region = "US") =>
    ["movie-catalog", "details", movieId, language, region] as const,
};

export const movieGenresQueryOptions = (language = "en-US") =>
  queryOptions({
    queryKey: movieCatalogKeys.genres(language),
    queryFn: () =>
      parseRpc(
        api.api.movies.tmdb["movie-genres"].$get({
          query: {language},
        }),
      ),
    staleTime: 1000 * 60 * 60,
  });

export const movieWatchProvidersQueryOptions = (
  region = "US",
  language = "en-US",
) =>
  queryOptions({
    queryKey: movieCatalogKeys.watchProviders(region, language),
    queryFn: () =>
      parseRpc(
        api.api.movies.tmdb["watch-providers"].$get({
          query: {region, language},
        }),
      ),
    staleTime: 1000 * 60 * 60,
  });

export const movieDetailsQueryOptions = (
  movieId: string,
  language = "en-US",
  region = "US",
) =>
  queryOptions({
    queryKey: movieCatalogKeys.details(movieId, language, region),
    queryFn: () =>
      parseRpc(
        api.api.movies[":movieId"].$get({
          param: {movieId},
          query: {language, region},
        }),
      ),
    enabled: Boolean(movieId),
    staleTime: 1000 * 60 * 60,
  });
