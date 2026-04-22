import {zValidator} from "@hono/zod-validator";
import {z} from "zod";
import {createRouter} from "../common/hono";
import * as GameSettingsService from "./game-settings.service";

const tmdbLanguageQuerySchema = z.object({
  language: z.string().trim().min(2).max(10).optional().default("en-US"),
});

export const settingsController = createRouter()
  .get("/game", async (c) =>
    c.json({
      defaults: GameSettingsService.DEFAULT_GAME_SETTINGS,
    }))
  .get("/game/movie-genres", zValidator("query", tmdbLanguageQuerySchema), async (c) => {
    const query = c.req.valid("query");
    return c.json({
      items: await GameSettingsService.getSelectableMovieGenres(query.language),
    });
  });
