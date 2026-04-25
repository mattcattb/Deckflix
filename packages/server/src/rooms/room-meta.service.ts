import {z} from "zod";
import {gameCodeSchema, gameStatusSchema} from "@deckflix/shared";
import {NotFoundException} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";
import {
  normalizeGameCode,
  roomKey,
  ROOM_TTL_SECONDS,
} from "./room-lifecycle.service";

const displayRecordSchema = z.object({
  id: z.string().min(1),
  sessionToken: z.string().min(1),
});

const gameMetaRecordSchema = z.object({
  id: z.string().min(1),
  code: gameCodeSchema,
  roomName: z.string().min(1).max(60).nullable(),
  poolSeed: z.string().min(1),
  status: gameStatusSchema,
  createdAt: z.string().datetime(),
  endedAt: z.string().datetime().nullable(),
  display: displayRecordSchema,
});

export type DisplayRecord = z.infer<typeof displayRecordSchema>;
export type GameMetaRecord = z.infer<typeof gameMetaRecordSchema>;

const gameStatusRecordSchema = z.object({
  status: gameStatusSchema,
  endedAt: z.string().datetime().nullable(),
});

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
  const key = roomKey(normalized);
  const normalizedMeta = {
    id: meta.id,
    code: normalized,
    roomName: meta.roomName,
    createdAt: meta.createdAt,
  };
  const created = await redis.hSetNX(key, "meta", JSON.stringify(normalizedMeta));

  if (created) {
    const multi = redis.multi();
    multi.hSet(key, "status", JSON.stringify({
      status: meta.status,
      endedAt: meta.endedAt,
    }));
    multi.hSet(key, "display", JSON.stringify(meta.display));
    multi.hSet(key, "poolSeed", meta.poolSeed);
    multi.expire(key, ROOM_TTL_SECONDS);
    await multi.exec();
  }

  return Boolean(created);
};

export const getGameMetaOrThrow = async (gameCode: string) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const [metaRaw, statusRaw, displayRaw, poolSeed] = await redis.hmGet(
    roomKey(normalized),
    ["meta", "status", "display", "poolSeed"],
  );
  if (!metaRaw || !statusRaw || !displayRaw || !poolSeed) {
    throw new NotFoundException(`Game ${normalized} not found`);
  }

  const meta = parseJson(
    metaRaw,
    gameMetaRecordSchema.pick({
      id: true,
      code: true,
      roomName: true,
      createdAt: true,
    }),
    `Game ${normalized} not found`,
  );
  const status = parseJson(
    statusRaw,
    gameStatusRecordSchema,
    `Game ${normalized} not found`,
  );
  const display = parseJson(
    displayRaw,
    displayRecordSchema,
    `Game ${normalized} not found`,
  );

  return gameMetaRecordSchema.parse({
    ...meta,
    ...status,
    display,
    poolSeed,
  });
};

export const setGameMeta = async (gameCode: string, meta: GameMetaRecord) => {
  await ensureRedis();
  const key = roomKey(gameCode);
  const multi = redis.multi();
  multi.hSet(key, "meta", JSON.stringify({
    id: meta.id,
    code: normalizeGameCode(meta.code),
    roomName: meta.roomName,
    createdAt: meta.createdAt,
  }));
  multi.hSet(key, "status", JSON.stringify({
    status: meta.status,
    endedAt: meta.endedAt,
  }));
  multi.hSet(key, "display", JSON.stringify(meta.display));
  multi.hSet(key, "poolSeed", meta.poolSeed);
  multi.expire(key, ROOM_TTL_SECONDS);
  await multi.exec();
};
