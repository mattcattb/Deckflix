import {
  playerTasteSchema,
  type GamePreferences,
  type PlayerTaste,
  type PlayerTasteInput,
} from "@deckflix/shared";
import {redisClient} from "../redis/redis";
import {roomPrefix, ROOM_TTL_SECONDS} from "../rooms/room-keys";

export const DEFAULT_PLAYER_TASTE: PlayerTaste = {
  genreIds: [],
  moods: [],
  discovery: "balanced",
  anchorMovieIds: [],
};

const tastesKey = (gameCode: string) => `${roomPrefix(gameCode)}player_tastes`;

export const getPlayerTaste = async (gameCode: string, playerId: string) => {
  const raw = await redisClient.hGet(tastesKey(gameCode), playerId);
  return raw
    ? playerTasteSchema.parse(JSON.parse(raw))
    : DEFAULT_PLAYER_TASTE;
};

export const setPlayerTaste = async (
  gameCode: string,
  playerId: string,
  input: PlayerTasteInput,
) => {
  const current = await getPlayerTaste(gameCode, playerId);
  const taste = playerTasteSchema.parse({...current, ...input});
  const key = tastesKey(gameCode);
  await redisClient
    .multi()
    .hSet(key, playerId, JSON.stringify(taste))
    .expire(key, ROOM_TTL_SECONDS)
    .exec();
  return taste;
};

export const listPlayerTastes = async (gameCode: string) => {
  const values = Object.values(await redisClient.hGetAll(tastesKey(gameCode)));
  return values.map((value) => playerTasteSchema.parse(JSON.parse(value)));
};

const moodGenreIds: Record<PlayerTaste["moods"][number], number[]> = {
  funny: [35],
  cozy: [10751, 10749],
  exciting: [28, 12],
  thoughtful: [18, 99],
  scary: [27, 53],
  romantic: [10749],
  weird: [878, 14],
  nostalgic: [],
};

export const applyPlayerTastes = (
  preferences: GamePreferences,
  tastes: PlayerTaste[],
) => {
  const genreCounts = new Map<number, number>();
  for (const taste of tastes) {
    for (const genreId of [
      ...taste.genreIds,
      ...taste.moods.flatMap((mood) => moodGenreIds[mood]),
    ]) {
      genreCounts.set(genreId, (genreCounts.get(genreId) ?? 0) + 1);
    }
  }

  const tasteGenreIds = [...genreCounts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0] - right[0])
    .map(([genreId]) => genreId)
    .slice(0, 5);
  const discoveryCounts = tastes.reduce(
    (counts, taste) => ({
      ...counts,
      [taste.discovery]: counts[taste.discovery] + 1,
    }),
    {familiar: 0, balanced: 0, adventurous: 0},
  );
  const popularityPreset =
    preferences.popularityPreset !== "balanced"
      ? preferences.popularityPreset
      : discoveryCounts.adventurous > discoveryCounts.familiar
        ? "niche"
        : discoveryCounts.familiar > discoveryCounts.adventurous
          ? "popular"
          : "balanced";

  return {
    ...preferences,
    popularityPreset,
    includedGenreIds: preferences.includedGenreIds.length
      ? preferences.includedGenreIds
      : tasteGenreIds,
  } satisfies GamePreferences;
};

export const listTasteAnchorMovieIds = (tastes: PlayerTaste[]) =>
  [...new Set(tastes.flatMap((taste) => taste.anchorMovieIds))];
