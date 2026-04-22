import {z} from "zod";
import {gameStatusSchema} from "@deckflix/shared";
import {NotFoundException} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";
import {GAME_TTL_SECONDS, normalizeGameCode} from "../games/game-redis.service";

const displayRecordSchema = z.object({
  id: z.string().min(1),
  sessionToken: z.string().min(1),
});

const gameMetaRecordSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  roomName: z.string().min(1).max(60).nullable(),
  status: gameStatusSchema,
  createdAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  display: displayRecordSchema,
});

export type DisplayRecord = z.infer<typeof displayRecordSchema>;
export type GameMetaRecord = z.infer<typeof gameMetaRecordSchema>;

const metaKey = (gameCode: string) => `game:${normalizeGameCode(gameCode)}:meta`;

const parseJson = <T>(raw: string, schema: z.ZodType<T>, label: string): T => {
  let parsedValue: unknown;

  try {
    parsedValue = JSON.parse(raw);
  } catch {
    throw new NotFoundException(label);
  }

  const parsed = schema.safeParse(parsedValue);
  if (!parsed.success) {
    throw new NotFoundException(label);
  }

  return parsed.data;
};

export const createGameMeta = async (meta: GameMetaRecord) => {
  await ensureRedis();
  const normalized = normalizeGameCode(meta.code);
  const created = await redis.set(metaKey(normalized), JSON.stringify({
    ...meta,
    code: normalized,
  }), {
    NX: true,
    EX: GAME_TTL_SECONDS,
  });

  return Boolean(created);
};

export const getGameMetaOrThrow = async (gameCode: string) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const raw = await redis.get(metaKey(normalized));
  if (!raw) {
    throw new NotFoundException(`Game ${normalized} not found`);
  }

  return parseJson(raw, gameMetaRecordSchema, `Game ${normalized} not found`);
};

export const setGameMeta = async (gameCode: string, meta: GameMetaRecord) => {
  await ensureRedis();
  await redis.set(metaKey(gameCode), JSON.stringify(meta));
};
