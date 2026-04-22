import {z} from "zod";

export const socketPingEventSchema = z.object({
  type: z.literal("socket.ping"),
});

export const socketPongEventSchema = z.object({
  type: z.literal("socket.pong"),
});

export const socketErrorEventSchema = z.object({
  type: z.literal("socket.error"),
  payload: z.object({
    message: z.string().min(1),
  }),
});

export type SocketPingEvent = z.infer<typeof socketPingEventSchema>;
export type SocketPongEvent = z.infer<typeof socketPongEventSchema>;
export type SocketErrorEvent = z.infer<typeof socketErrorEventSchema>;
