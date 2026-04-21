import type {GameSettings, GameSettingsInput} from "@deckflix/shared";
import {getTmdbMovieGenres} from "../tmdb/tmdb.service";

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  minLikesToMatch: 2,
  maxMovies: 100,
  allowMaybe: true,
  allowSuperLike: true,
  selectedGenreIds: [],
};

export const resolveGameSettings = (settings?: GameSettingsInput): GameSettings => ({
  ...DEFAULT_GAME_SETTINGS,
  ...settings,
  selectedGenreIds: settings?.selectedGenreIds ?? DEFAULT_GAME_SETTINGS.selectedGenreIds,
});

export const buildMovieDiscoveryFilters = (settings: GameSettings) => ({
  genreIds: settings.selectedGenreIds?.length ? settings.selectedGenreIds : undefined,
  sortBy: "popularity.desc",
  voteCountGte: 50,
});

export const getSelectableMovieGenres = async (language = "en-US") =>
  getTmdbMovieGenres(language);
