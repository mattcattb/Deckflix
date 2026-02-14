import { z } from "zod";

export const createProjectSchema = z.object({
  name: z.string().min(1).max(120),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
