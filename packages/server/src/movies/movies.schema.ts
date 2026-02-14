import { z } from "zod";

export const movieSearchQuerySchema = z.object({
  q: z.string().trim().min(1).max(120),
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});

export const moviePopularQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(500).optional().default(1),
});
