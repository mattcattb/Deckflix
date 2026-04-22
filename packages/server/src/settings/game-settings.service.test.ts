import {describe, expect, mock, test} from "bun:test";
import {z} from "zod";

const discoverTmdbMovies = mock();
const searchTmdbMovies = mock();
const getTmdbPopularMovies = mock();
const getTmdbMovieById = mock();
const getTmdbMovieGenres = mock();
const isTmdbConfigured = mock(() => true);

const gameSettingsSchema = z.object({
  gameplay: z.object({
    minLikesToMatch: z.number().int().min(1).max(50),
    maxMovies: z.number().int().min(1).max(500),
    allowMaybe: z.boolean(),
    allowSuperLike: z.boolean(),
  }),
  movieFilters: z
    .object({
      includedGenreIds: z.array(z.number().int().positive()).max(10),
      excludedGenreIds: z.array(z.number().int().positive()).max(10),
      primaryReleaseDateGte: z.string().nullable(),
      primaryReleaseDateLte: z.string().nullable(),
      voteAverageGte: z.number().nullable(),
      voteAverageLte: z.number().nullable(),
    })
    .superRefine((value, ctx) => {
      if (
        value.primaryReleaseDateGte &&
        value.primaryReleaseDateLte &&
        value.primaryReleaseDateGte > value.primaryReleaseDateLte
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["primaryReleaseDateGte"],
          message: "Minimum release date must be earlier than maximum release date",
        });
      }

      if (
        value.voteAverageGte !== null &&
        value.voteAverageLte !== null &&
        value.voteAverageGte > value.voteAverageLte
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["voteAverageGte"],
          message: "Minimum rating must be less than or equal to maximum rating",
        });
      }

      if (
        value.includedGenreIds.some((genreId) => value.excludedGenreIds.includes(genreId))
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["includedGenreIds"],
          message: "Included and excluded genres cannot overlap",
        });
      }
    }),
});

mock.module("@deckflix/shared", () => ({
  ERROR_MESSAGES: {
    BAD_REQUEST: "Bad request",
    UNAUTHORIZED: "Unauthorized",
    FORBIDDEN: "Forbidden",
    CONFLICT: "Conflict",
    NOT_FOUND: "Not found",
    VALIDATION_ERROR: "Validation failed",
    SERVICE_ERROR: "Service error",
    INTERNAL_ERROR: "Internal server error",
  },
  gameSettingsSchema,
}));
mock.module(new URL("../lib/tmdb.ts", import.meta.url).href, () => ({
  discoverTmdbMovies,
  searchTmdbMovies,
  getTmdbPopularMovies,
  getTmdbMovieById,
  getTmdbMovieGenres,
  isTmdbConfigured,
}));
mock.module(new URL("../lib/redis.ts", import.meta.url).href, () => ({
  ensureRedis: mock(),
  redis: {
    get: mock(),
    set: mock(),
  },
}));

const GameSettingsService = await import(
  new URL("./game-settings.service.ts", import.meta.url).href
);

describe("game settings", () => {
  test("resolves fully materialized nested defaults", () => {
    expect(GameSettingsService.resolveGameSettings()).toEqual(
      GameSettingsService.DEFAULT_GAME_SETTINGS,
    );
  });

  test("merges nested gameplay and movie filter updates", () => {
    const merged = GameSettingsService.mergeGameSettings(
      GameSettingsService.DEFAULT_GAME_SETTINGS,
      {
        gameplay: {
          maxMovies: 150,
        },
        movieFilters: {
          includedGenreIds: [28, 35],
          voteAverageGte: 7.2,
        },
      },
    );

    expect(merged).toEqual({
      gameplay: {
        ...GameSettingsService.DEFAULT_GAME_SETTINGS.gameplay,
        maxMovies: 150,
      },
      movieFilters: {
        ...GameSettingsService.DEFAULT_GAME_SETTINGS.movieFilters,
        includedGenreIds: [28, 35],
        voteAverageGte: 7.2,
      },
    });
  });

  test("rejects invalid date, rating, and overlapping genre filters", () => {
    const parsed = gameSettingsSchema.safeParse({
      gameplay: GameSettingsService.DEFAULT_GAME_SETTINGS.gameplay,
      movieFilters: {
        includedGenreIds: [28],
        excludedGenreIds: [28],
        primaryReleaseDateGte: "2025-01-01",
        primaryReleaseDateLte: "2024-01-01",
        voteAverageGte: 8.5,
        voteAverageLte: 7.5,
      },
    });

    expect(parsed.success).toBe(false);
  });

  test("maps nested movie filters into tmdb discovery filters", () => {
    const filters = GameSettingsService.buildMovieDiscoveryFilters(
      GameSettingsService.resolveGameSettings({
        movieFilters: {
          includedGenreIds: [28, 35],
          excludedGenreIds: [27],
          primaryReleaseDateGte: "2020-01-01",
          primaryReleaseDateLte: "2024-12-31",
          voteAverageGte: 6.5,
          voteAverageLte: 8.8,
        },
      }),
    );

    expect(filters).toEqual({
      includedGenreIds: [28, 35],
      excludedGenreIds: [27],
      primaryReleaseDateGte: "2020-01-01",
      primaryReleaseDateLte: "2024-12-31",
      voteAverageGte: 6.5,
      voteAverageLte: 8.8,
    });
  });

  test("omits empty movie filters from tmdb discovery mapping", () => {
    expect(
      GameSettingsService.buildMovieDiscoveryFilters(
        GameSettingsService.DEFAULT_GAME_SETTINGS,
      ),
    ).toEqual({
      includedGenreIds: undefined,
      excludedGenreIds: undefined,
      primaryReleaseDateGte: undefined,
      primaryReleaseDateLte: undefined,
      voteAverageGte: undefined,
      voteAverageLte: undefined,
    });
  });
});
