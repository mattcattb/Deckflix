import {z} from "zod";

const betterAuthSchema = z.object({
  BETTER_AUTH_SECRET: z.string(),
  BETTER_AUTH_URL: z.string(),
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
  DATABASE_URL: z.string(),

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
  }, z.number().int().positive().default(3000)),
});
export const appEnv = appEnvSchema.parse(process.env);
