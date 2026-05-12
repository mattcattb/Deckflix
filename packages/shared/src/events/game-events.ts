import {z} from "zod";
import {swipeChoiceSchema} from "../game-core";
import {gameCodeSchema} from "../game-sessions";

export const gameVoteRecordedEventSchema = z.object({
  type: z.literal("game.vote_recorded"),
  gameCode: gameCodeSchema,
  playerId: z.string().min(1),
  movieId: z.string().min(1),
  choice: swipeChoiceSchema,
  votedAt: z.string().datetime(),
});

export const gameMatchFoundEventSchema = z.object({
  type: z.literal("game.match_found"),
  gameCode: gameCodeSchema,
  movieId: z.string().min(1),
});

export type GameVoteRecordedEvent = z.infer<typeof gameVoteRecordedEventSchema>;
export type GameMatchFoundEvent = z.infer<typeof gameMatchFoundEventSchema>;
