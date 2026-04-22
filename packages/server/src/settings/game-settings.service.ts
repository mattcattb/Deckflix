import type {GameSettings, GameSettingsInput} from "@deckflix/shared";
import {gameSettingsSchema} from "@deckflix/shared";
import {z} from "zod";
import {NotFoundException} from "../common/errors";
import {getTmdbMovieGenres} from "../lib/tmdb";
import {ensureRedis, redis} from "../lib/redis";

const GAME_TTL_SECONDS = 60 * 60 * 24;

const normalizeGameCode = (gameCode: string) => gameCode.trim().toUpperCase();

const settingsKey = (gameCode: string) =>
  `game:${normalizeGameCode(gameCode)}:settings`;

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  gameplay: {
    minLikesToMatch: 2,
    maxMovies: 100,
    allowMaybe: true,
    allowSuperLike: true,
  },
  movieFilters: {
    includedGenreIds: [],
    excludedGenreIds: [],
    primaryReleaseDateGte: null,
    primaryReleaseDateLte: null,
    voteAverageGte: null,
    voteAverageLte: null,
  },
};

const parseSettings = (raw: string, gameCode: string) => {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(raw);
  } catch {
    throw new NotFoundException(
      `Game ${normalizeGameCode(gameCode)} not found`,
    );
  }

  const parsed = gameSettingsSchema.safeParse(parsedValue);
  if (!parsed.success) {
    throw new NotFoundException(
      `Game ${normalizeGameCode(gameCode)} not found`,
    );
  }

  return parsed.data;
};

export const resolveGameSettings = (
  settings?: GameSettingsInput,
): GameSettings =>
  (() => {
    const gameplayInput: NonNullable<GameSettingsInput["gameplay"]> =
      settings?.gameplay ?? {};
    const movieFilterInput: NonNullable<GameSettingsInput["movieFilters"]> =
      settings?.movieFilters ?? {};

    return gameSettingsSchema.parse({
      gameplay: {
        ...DEFAULT_GAME_SETTINGS.gameplay,
        ...gameplayInput,
      },
      movieFilters: {
        ...DEFAULT_GAME_SETTINGS.movieFilters,
        ...movieFilterInput,
        includedGenreIds:
          movieFilterInput.includedGenreIds ??
          DEFAULT_GAME_SETTINGS.movieFilters.includedGenreIds,
        excludedGenreIds:
          movieFilterInput.excludedGenreIds ??
          DEFAULT_GAME_SETTINGS.movieFilters.excludedGenreIds,
        primaryReleaseDateGte:
          movieFilterInput.primaryReleaseDateGte ??
          DEFAULT_GAME_SETTINGS.movieFilters.primaryReleaseDateGte,
        primaryReleaseDateLte:
          movieFilterInput.primaryReleaseDateLte ??
          DEFAULT_GAME_SETTINGS.movieFilters.primaryReleaseDateLte,
        voteAverageGte:
          movieFilterInput.voteAverageGte ??
          DEFAULT_GAME_SETTINGS.movieFilters.voteAverageGte,
        voteAverageLte:
          movieFilterInput.voteAverageLte ??
          DEFAULT_GAME_SETTINGS.movieFilters.voteAverageLte,
      },
    });
  })();

export const mergeGameSettings = (
  currentSettings: GameSettings,
  nextSettings?: GameSettingsInput,
) =>
  resolveGameSettings({
    gameplay: {
      ...currentSettings.gameplay,
      ...(nextSettings?.gameplay ?? {}),
    },
    movieFilters: {
      ...currentSettings.movieFilters,
      ...(nextSettings?.movieFilters ?? {}),
    },
  });

export const buildMovieDiscoveryFilters = (settings: GameSettings) => ({
  includedGenreIds: settings.movieFilters.includedGenreIds.length
    ? settings.movieFilters.includedGenreIds
    : undefined,
  excludedGenreIds: settings.movieFilters.excludedGenreIds.length
    ? settings.movieFilters.excludedGenreIds
    : undefined,
  primaryReleaseDateGte:
    settings.movieFilters.primaryReleaseDateGte ?? undefined,
  primaryReleaseDateLte:
    settings.movieFilters.primaryReleaseDateLte ?? undefined,
  voteAverageGte: settings.movieFilters.voteAverageGte ?? undefined,
  voteAverageLte: settings.movieFilters.voteAverageLte ?? undefined,
  sortBy: "popularity.desc",
  voteCountGte: 50,
});

export const getSelectableMovieGenres = async (language = "en-US") =>
  getTmdbMovieGenres(language);

export const getGameSettingsOrThrow = async (gameCode: string) => {
  await ensureRedis();
  const raw = await redis.get(settingsKey(gameCode));
  if (!raw) {
    throw new NotFoundException(
      `Game ${normalizeGameCode(gameCode)} not found`,
    );
  }

  return parseSettings(raw, gameCode);
};

export const setGameSettings = async (
  gameCode: string,
  settings: GameSettings,
) => {
  await ensureRedis();
  await redis.set(settingsKey(gameCode), JSON.stringify(settings), {
    EX: GAME_TTL_SECONDS,
  });
};
