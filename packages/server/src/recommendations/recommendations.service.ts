import type {GameSettings, MovieCandidate} from "@deckflix/shared";
import {randomUUID} from "node:crypto";
import {BadRequestException} from "../common/errors";
import * as PreferencesService from "../rooms/room-preferences.service";
import {redisClient} from "../redis/redis";
import {
  fetchRecommendationCandidates,
  planRecommendationQueries,
  scoreRecommendationCandidates,
  selectRecommendedMovies,
} from "./recommendation-engine";

const recentRecommendationHistoryKey = () => "pool:recent-history";

const DAY_IN_MS = 24 * 60 * 60 * 1000;
const RECENT_HISTORY_TTL_MS = 14 * DAY_IN_MS;

const getRecentHistoryTimestamps = async (movieIds: string[]) => {
  await redisClient.zRemRangeByScore(
    recentRecommendationHistoryKey(),
    0,
    Date.now() - RECENT_HISTORY_TTL_MS,
  );

  const scores = await Promise.all(
    movieIds.map(async (movieId) => {
      const value = await redisClient.zScore(
        recentRecommendationHistoryKey(),
        movieId,
      );
      return [movieId, value == null ? null : Number(value)] as const;
    }),
  );

  return new Map(scores);
};

const updateRecentRecommendationHistory = async (movies: MovieCandidate[]) => {
  if (movies.length === 0) {
    return;
  }

  const now = Date.now();
  await redisClient.zAdd(
    recentRecommendationHistoryKey(),
    movies.map((movie) => ({
      value: movie.id,
      score: now,
    })),
  );
  await redisClient.zRemRangeByScore(
    recentRecommendationHistoryKey(),
    0,
    now - RECENT_HISTORY_TTL_MS,
  );
};

export const createRecommendationSeed = () => randomUUID();

export const generateInitialRecommendations = async (input: {
  gameCode: string;
  poolSeed: string;
  settings: GameSettings;
  preferences?: PreferencesService.GamePreferences;
  targetSize?: number;
  excludeMovieIds?: string[];
  selectionSalt?: string;
}): Promise<MovieCandidate[]> => {
  const preferences =
    input.preferences ??
    (await PreferencesService.getGamePreferencesOrThrow(input.gameCode));
  const settings = input.targetSize
    ? {
        ...input.settings,
        gameplay: {
          ...input.settings.gameplay,
          maxMovies: input.targetSize,
        },
      }
    : input.settings;
  const plan = planRecommendationQueries(settings, preferences, input.poolSeed);
  const fetchedCandidates = await fetchRecommendationCandidates({
    plan,
    settings,
    preferences,
  });
  const excludedMovieIds = new Set(input.excludeMovieIds ?? []);
  const availableCandidates = fetchedCandidates.filter(
    (candidate) => !excludedMovieIds.has(candidate.movie.id),
  );

  if (availableCandidates.length === 0) {
    throw new BadRequestException("No movies available to build queue");
  }

  const recentHistoryTimestamps = await getRecentHistoryTimestamps(
    availableCandidates.map((candidate) => candidate.movie.id),
  );
  const candidates = scoreRecommendationCandidates(
    availableCandidates,
    preferences,
    recentHistoryTimestamps,
  );
  const selectionSalt = input.selectionSalt ?? randomUUID();
  const movies = selectRecommendedMovies(
    candidates,
    settings,
    preferences,
    selectionSalt,
  );
  if (movies.length === 0) {
    throw new BadRequestException("No movies available to build queue");
  }

  await updateRecentRecommendationHistory(movies);
  return movies;
};

export const generateRecommendationExpansion = async (input: {
  gameCode: string;
  poolSeed: string;
  settings: GameSettings;
  preferences: PreferencesService.GamePreferences;
  existingMovieIds: string[];
  targetSize: number;
}) =>
  generateInitialRecommendations({
    gameCode: input.gameCode,
    poolSeed: `${input.poolSeed}:expansion:${input.existingMovieIds.length}`,
    settings: input.settings,
    preferences: input.preferences,
    targetSize: input.targetSize,
    excludeMovieIds: input.existingMovieIds,
    selectionSalt: `${input.poolSeed}:selection:${input.existingMovieIds.length}`,
  });
