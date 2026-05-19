import {z} from "zod";

const DEFAULT_DATABASE_URL =
  "postgresql://postgres:postgres@localhost:15432/postgres";
const DEFAULT_REDIS_URL = "redis://localhost:16380";
const DEFAULT_APP_URL = "http://localhost:4173";

const firstNonEmpty = (...values: Array<string | undefined>) =>
  values.find((value) => value && value.trim() !== "");

const betterAuthSchema = z.object({
  BETTER_AUTH_SECRET: z.string().default("deckflix-local-dev-secret-change-me"),
  BETTER_AUTH_URL: z.string().default(DEFAULT_APP_URL),
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
  PUBLIC_API_URL: z.string().optional(),
  PUBLIC_APP_URL: z.string().optional(),
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
  process.env.BETTER_AUTH_URL =
    firstNonEmpty(process.env.PUBLIC_APP_URL, DEFAULT_APP_URL) || DEFAULT_APP_URL;
}

if (!process.env.CORS_ORIGINS) {
  process.env.CORS_ORIGINS =
    firstNonEmpty(process.env.PUBLIC_APP_URL, process.env.BETTER_AUTH_URL) ||
    DEFAULT_APP_URL;
}

export const appEnv = appEnvSchema.parse(process.env);
