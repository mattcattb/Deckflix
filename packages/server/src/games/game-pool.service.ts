import type {MovieCandidate} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import * as MoviesService from "../movies/movies.service";
import {discoverTmdbMovies, isTmdbConfigured} from "../tmdb/tmdb.service";
import {buildMovieDiscoveryFilters} from "../settings/game-settings.service";
import type {GameSettings} from "@deckflix/shared";

export const buildInitialPool = async (input: {
  settings: GameSettings;
}): Promise<MovieCandidate[]> => {
  const items: MovieCandidate[] = [];
  const seenMovieIds = new Set<string>();
  let page = 1;
  let totalPages = 1;
  const maxMovies = input.settings.maxMovies;
  const filters = buildMovieDiscoveryFilters(input.settings);

  while (items.length < maxMovies && page <= totalPages) {
    const result = isTmdbConfigured()
      ? await discoverTmdbMovies({
        page,
        genreIds: filters.genreIds,
        sortBy: filters.sortBy,
        voteCountGte: filters.voteCountGte,
      }).catch(() => MoviesService.getPopularMovies({page}))
      : await MoviesService.getPopularMovies({page});

    totalPages = result.totalPages;

    for (const movie of result.items) {
      if (seenMovieIds.has(movie.id)) {
        continue;
      }

      seenMovieIds.add(movie.id);
      items.push(movie);

      if (items.length >= maxMovies) {
        break;
      }
    }

    page += 1;
  }

  if (items.length === 0) {
    throw new BadRequestException("No movies available to build queue");
  }

  return items;
};

export const maybeRefillPool = async (_input: {gameCode: string}) => {
  return null;
};
