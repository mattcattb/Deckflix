import {queryOptions} from "@tanstack/react-query";
import {api, parseRpc} from "../../lib/api";

const movieCatalogKeys = {
  genres: (language = "en-US") => ["movie-catalog", "genres", language] as const,
  details: (movieId: string, language = "en-US") =>
    ["movie-catalog", "details", movieId, language] as const,
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

export const movieDetailsQueryOptions = (movieId: string, language = "en-US") =>
  queryOptions({
    queryKey: movieCatalogKeys.details(movieId, language),
    queryFn: () =>
      parseRpc(
        api.api.movies[":movieId"].$get({
          param: {movieId},
          query: {language},
        }),
      ),
    enabled: Boolean(movieId),
    staleTime: 1000 * 60 * 60,
  });
