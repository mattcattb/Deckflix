import {z} from "zod";

const roomRoles = ["display", "player"] as const;
export const GAME_CODE_LENGTH = 4;
export const gameCodeSchema = z
  .string()
  .trim()
  .regex(
    new RegExp(`^[A-Z0-9]{${GAME_CODE_LENGTH}}$`),
    `Room codes must be ${GAME_CODE_LENGTH} characters`,
  );

const roomRoleSchema = z.enum(roomRoles);

const displaySessionSchema = z.object({
  gameCode: gameCodeSchema,
  displayId: z.string().min(1),
  sessionToken: z.string().min(1),
});

const playerSessionSchema = z.object({
  gameCode: gameCodeSchema,
  playerId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const roomSessionSchema = z.object({
  gameCode: gameCodeSchema,
  role: roomRoleSchema,
  roleId: z.string().min(1),
  sessionToken: z.string().min(1),
});

export const encodeRoomSessionToken = (value: RoomSession) =>
  `${value.gameCode}.${value.role}.${value.roleId}.${value.sessionToken}`;

export const decodeRoomSessionToken = (value?: string | null) => {
  if (!value) {
    return null;
  }

  const [gameCode, role, roleId, sessionToken] = value.split(".", 4);
  const parsed = roomSessionSchema.safeParse({
    gameCode,
    role,
    roleId,
    sessionToken,
  });

  return parsed.success ? parsed.data : null;
};

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
    gameCode: gameCodeSchema,
    roomName: z.string().min(1).max(60).nullable(),
  }),
  z.object({
    role: z.literal("player"),
    gameCode: gameCodeSchema,
    roomName: z.string().min(1).max(60).nullable(),
  }),
  z.object({
    role: z.literal("none"),
  }),
]);

export type DisplaySession = z.infer<typeof displaySessionSchema>;
export type PlayerSession = z.infer<typeof playerSessionSchema>;
export type RoomSession = z.infer<typeof roomSessionSchema>;
export type RoomClient = z.infer<typeof roomClientSchema>;
export type ActiveRoomClient = z.infer<typeof activeRoomClientSchema>;
