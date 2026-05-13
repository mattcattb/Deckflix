import {
  gamePreferencesPatchSchema,
  gamePreferencesSchema,
  type GamePreferences,
  type GamePreferencesPatch,
} from "@deckflix/shared";
import type {MovieQueryOptions} from "tmdb-ts";
import {NotFoundException} from "../common/errors";
import {redisClient} from "../redis/redis";

export {gamePreferencesPatchSchema} from "@deckflix/shared";
export type {GamePreferences, GamePreferencesPatch} from "@deckflix/shared";

const ROOM_TTL_SECONDS = 60 * 60 * 24;

const normalizeGameCode = (gameCode: string) => gameCode.trim().toUpperCase();

const roomPrefix = (gameCode: string) => `game:${normalizeGameCode(gameCode)}:`;

export const DEFAULT_GAME_PREFERENCES: GamePreferences = {
  popularityPreset: "balanced",
  includedGenreIds: [],
  excludedGenreIds: [],
  preferredProviderIds: [],
  excludedProviderIds: [],
  watchRegion: "US",
  primaryReleaseDateGte: null,
  primaryReleaseDateLte: null,
  voteAverageGte: null,
  voteAverageLte: null,
};

const preferencesKey = (gameCode: string) =>
  `${roomPrefix(gameCode)}preferences`;

const encodeField = (value: unknown) => JSON.stringify(value);

const decodeField = (raw: string | Buffer) => JSON.parse(raw.toString());

const encodePreferences = (preferences: GamePreferences) =>
  Object.fromEntries(
    Object.entries(preferences).map(([key, value]) => [key, encodeField(value)]),
  );

const decodePreferencesHash = (
  raw: Record<string, string | Buffer>,
  gameCode: string,
) => {
  if (Object.keys(raw).length === 0) {
    throw new NotFoundException(
      `Preferences for game ${normalizeGameCode(gameCode)} not found`,
    );
  }

  return gamePreferencesSchema.parse({
    ...DEFAULT_GAME_PREFERENCES,
    ...Object.fromEntries(
      Object.entries(raw).map(([key, value]) => [key, decodeField(value)]),
    ),
  });
};

export const resolveGamePreferences = (
  preferences?: GamePreferencesPatch,
): GamePreferences =>
  gamePreferencesSchema.parse({
    ...DEFAULT_GAME_PREFERENCES,
    ...(preferences ?? {}),
  });

export const createGamePreferences = async (
  gameCode: string,
  preferences?: GamePreferencesPatch,
) => {
  const resolved = resolveGamePreferences(preferences);
  const key = preferencesKey(gameCode);
  const multi = redisClient.multi();
  multi.hSet(key, encodePreferences(resolved));
  multi.expire(key, ROOM_TTL_SECONDS);
  await multi.exec();
  return resolved;
};

export const getGamePreferencesOrThrow = async (gameCode: string) => {
  const raw = await redisClient.hGetAll(preferencesKey(gameCode));
  return decodePreferencesHash(raw, gameCode);
};

export const patchGamePreferences = async (
  gameCode: string,
  patch: GamePreferencesPatch,
) => {
  const parsedPatch = gamePreferencesPatchSchema.parse(patch);
  const current = await getGamePreferencesOrThrow(gameCode);
  const next = gamePreferencesSchema.parse({
    ...current,
    ...parsedPatch,
  });

  const changedEntries = Object.entries(parsedPatch);
  if (changedEntries.length === 0) {
    return next;
  }

  const key = preferencesKey(gameCode);
  const multi = redisClient.multi();
  multi.hSet(
    key,
    Object.fromEntries(
      changedEntries.map(([field, value]) => [field, encodeField(value)]),
    ),
  );
  multi.expire(key, ROOM_TTL_SECONDS);
  await multi.exec();

  return next;
};

export const buildMovieDiscoveryOptions = (
  preferences: GamePreferences,
): MovieQueryOptions => ({
  with_genres: preferences.includedGenreIds.length
    ? preferences.includedGenreIds.join("|")
    : undefined,
  without_genres: preferences.excludedGenreIds.length
    ? preferences.excludedGenreIds.join(",")
    : undefined,
  watch_region:
    preferences.preferredProviderIds.length ||
    preferences.excludedProviderIds.length
      ? preferences.watchRegion
      : undefined,
  with_watch_providers: preferences.preferredProviderIds.length
    ? preferences.preferredProviderIds.join("|")
    : undefined,
  without_watch_providers: preferences.excludedProviderIds.length
    ? preferences.excludedProviderIds.join(",")
    : undefined,
  "primary_release_date.gte": preferences.primaryReleaseDateGte ?? undefined,
  "primary_release_date.lte": preferences.primaryReleaseDateLte ?? undefined,
  "vote_average.gte": preferences.voteAverageGte ?? undefined,
  "vote_average.lte": preferences.voteAverageLte ?? undefined,
});
