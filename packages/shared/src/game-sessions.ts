import {z} from "zod";

export const roomRoles = ["display", "player"] as const;

export const roomRoleSchema = z.enum(roomRoles);

export const displaySessionSchema = z.object({
  gameCode: z.string().min(1),
  displayId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const playerSessionSchema = z.object({
  gameCode: z.string().min(1),
  playerId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const roomSessionSchema = z.object({
  gameCode: z.string().min(1),
  role: roomRoleSchema,
  roleId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const roomClientSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("display"),
  }),
  z.object({
    role: z.literal("player"),
  }),
  z.object({
    role: z.literal("none"),
  }),
]);

export const activeRoomClientSchema = z.discriminatedUnion("role", [
  z.object({
    role: z.literal("display"),
    gameCode: z.string().min(1),
    roomName: z.string().min(1).max(60).nullable(),
  }),
  z.object({
    role: z.literal("player"),
    gameCode: z.string().min(1),
    roomName: z.string().min(1).max(60).nullable(),
  }),
  z.object({
    role: z.literal("none"),
  }),
]);

export type RoomRole = z.infer<typeof roomRoleSchema>;
export type DisplaySession = z.infer<typeof displaySessionSchema>;
export type PlayerSession = z.infer<typeof playerSessionSchema>;
export type RoomSession = z.infer<typeof roomSessionSchema>;
export type RoomClient = z.infer<typeof roomClientSchema>;
export type ActiveRoomClient = z.infer<typeof activeRoomClientSchema>;
