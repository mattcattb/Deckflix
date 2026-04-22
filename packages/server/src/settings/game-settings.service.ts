import type {GameSettings, GameSettingsInput} from "@deckflix/shared";
import {gameSettingsSchema} from "@deckflix/shared";
import {NotFoundException} from "../common/errors";
import {getTmdbMovieGenres} from "../lib/tmdb";
import {ensureRedis, redis} from "../lib/redis";

const GAME_TTL_SECONDS = 60 * 60 * 24;

const normalizeGameCode = (gameCode: string) => gameCode.trim().toUpperCase();

const settingsKey = (gameCode: string) =>
  `game:${normalizeGameCode(gameCode)}:settings`;

const parseSettings = (raw: string, gameCode: string) => {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(raw);
  } catch {
    throw new NotFoundException(`Game ${normalizeGameCode(gameCode)} not found`);
  }

  const parsed = gameSettingsSchema.safeParse(parsedValue);
  if (!parsed.success) {
    throw new NotFoundException(`Game ${normalizeGameCode(gameCode)} not found`);
  }

  return parsed.data;
};

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

export const getGameSettingsOrThrow = async (gameCode: string) => {
  await ensureRedis();
  const raw = await redis.get(settingsKey(gameCode));
  if (!raw) {
    throw new NotFoundException(`Game ${normalizeGameCode(gameCode)} not found`);
  }

  return parseSettings(raw, gameCode);
};

export const setGameSettings = async (gameCode: string, settings: GameSettings) => {
  await ensureRedis();
  await redis.set(settingsKey(gameCode), JSON.stringify(settings), {
    EX: GAME_TTL_SECONDS,
  });
};
