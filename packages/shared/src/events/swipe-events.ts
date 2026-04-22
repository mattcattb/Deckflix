import {z} from "zod";
import {swipeChoiceSchema} from "../game-core";

export const swipeVoteRecordedEventSchema = z.object({
  type: z.literal("swipe.vote_recorded"),
  payload: z.object({
    playerId: z.string().min(1),
    movieId: z.string().min(1),
    choice: swipeChoiceSchema,
  }),
});

export const swipeMatchFoundEventSchema = z.object({
  type: z.literal("swipe.match_found"),
  payload: z.object({
    movieId: z.string().min(1),
  }),
});

export type SwipeVoteRecordedEvent = z.infer<typeof swipeVoteRecordedEventSchema>;
export type SwipeMatchFoundEvent = z.infer<typeof swipeMatchFoundEventSchema>;
