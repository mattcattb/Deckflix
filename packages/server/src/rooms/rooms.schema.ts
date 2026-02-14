import { z } from "zod";
import { swipeChoices } from "@matty-stack/shared";

export const roomSettingsSchema = z.object({
  minLikesToMatch: z.number().int().min(1).max(50).optional(),
  maxMovies: z.number().int().min(1).max(100).optional(),
  allowMaybe: z.boolean().optional(),
  allowSuperLike: z.boolean().optional(),
});

export const createRoomSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  settings: roomSettingsSchema.optional(),
});

export const joinRoomSchema = z.object({
  displayName: z.string().trim().min(1).max(40),
});

export const swipeChoiceSchema = z.enum(swipeChoices);

export const wsClientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("movie.swipe"),
    payload: z.object({
      movieId: z.string().min(1),
      choice: swipeChoiceSchema,
    }),
  }),
  z.object({
    type: z.literal("ping"),
  }),
]);

export type RoomSettingsInput = z.infer<typeof roomSettingsSchema>;
export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type SwipeChoice = z.infer<typeof swipeChoiceSchema>;
export type WsClientMessage = z.infer<typeof wsClientMessageSchema>;
