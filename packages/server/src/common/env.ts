import {z} from "zod";

export const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:15432/postgres";
export const DEFAULT_REDIS_URL = "redis://localhost:16380";

const betterAuthSchema = z.object({
  BETTER_AUTH_SECRET: z.string().default("deckflix-local-dev-secret-change-me"),
  BETTER_AUTH_URL: z.string().default("http://localhost:4173"),
});

const googleEnvSchema = z.object({
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_API_KEY: z.string().optional(),
});

const githubEnvSchema = z.object({
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
});

const appEnvSchema = z.object({
  ...betterAuthSchema.shape,
  ...googleEnvSchema.shape,
  ...githubEnvSchema.shape,
  DATABASE_URL: z.string().default(DEFAULT_DATABASE_URL),
  REDIS_URL: z.string().default(DEFAULT_REDIS_URL),
  LOG_LEVEL: z.string().optional(),
  CORS_ORIGINS: z.string().optional(),

  NODE_ENV: z.string().optional(),
  MOVIE_PROVIDER: z.enum(["tmdb", "mock"]).optional(),
  TMDB_API_KEY: z.string().optional(),
  TMDB_BASE_URL: z.string().optional().default("https://api.themoviedb.org/3"),
  TMDB_IMAGE_BASE_URL: z
    .string()
    .optional()
    .default("https://image.tmdb.org/t/p/w500"),

  PORT: z.preprocess((value) => {
    if (typeof value === "string" && value.trim() !== "") {
      return Number(value);
    }
    return value;
  }, z.number().int().positive().default(3100)),
});

if (!process.env.BETTER_AUTH_SECRET) {
  process.env.BETTER_AUTH_SECRET = "deckflix-local-dev-secret-change-me";
}

if (!process.env.BETTER_AUTH_URL) {
  process.env.BETTER_AUTH_URL = "http://localhost:4173";
}

export const appEnv = appEnvSchema.parse(process.env);
