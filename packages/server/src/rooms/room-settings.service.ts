import type {GameSettings, GameSettingsInput} from "@deckflix/shared";
import {gameSettingsSchema} from "@deckflix/shared";
import {NotFoundException} from "../common/errors";
import {redisClient} from "../redis/redis";

const ROOM_TTL_SECONDS = 60 * 60 * 24;

const normalizeGameCode = (gameCode: string) => gameCode.trim().toUpperCase();

const roomKey = (gameCode: string) =>
  `game:${normalizeGameCode(gameCode)}:room`;

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  gameplay: {
    maxMovies: 40,
    allowMaybe: true,
    allowSuperLike: true,
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
): GameSettings => {
  const gameplayInput: NonNullable<GameSettingsInput["gameplay"]> =
    settings?.gameplay ?? {};

  return gameSettingsSchema.parse({
    gameplay: {
      ...DEFAULT_GAME_SETTINGS.gameplay,
      ...gameplayInput,
    },
  });
};

export const mergeGameSettings = (
  currentSettings: GameSettings,
  nextSettings?: GameSettingsInput,
) =>
  resolveGameSettings({
    gameplay: {
      ...currentSettings.gameplay,
      ...(nextSettings?.gameplay ?? {}),
    },
  });

export const getGameSettingsOrThrow = async (gameCode: string) => {
  const raw = await redisClient.hGet(roomKey(gameCode), "settings");
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
  const key = roomKey(gameCode);
  await redisClient.hSet(key, "settings", JSON.stringify(settings));
  await redisClient.expire(key, ROOM_TTL_SECONDS);
};
