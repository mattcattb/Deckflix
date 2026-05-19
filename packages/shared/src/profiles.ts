import {z} from "zod";

export const PLAYER_DISPLAY_NAME_MAX_LENGTH = 40;

export const playerAvatarIds = [
  "popcorn",
  "ticket",
  "camera",
  "star",
  "heart",
  "bolt",
  "smile",
  "kid",
  "robot",
  "rocket",
  "crown",
  "ghost",
] as const;

export const playerAvatarIdSchema = z.enum(playerAvatarIds);

export type PlayerAvatarId = z.infer<typeof playerAvatarIdSchema>;

export const playerProfileIconIds = playerAvatarIds;
export const playerProfileIconIdSchema = playerAvatarIdSchema;
export type PlayerProfileIconId = PlayerAvatarId;
