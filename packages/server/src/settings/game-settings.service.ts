import {redis} from "../lib/redis";

const settingsKey = (roomId: string) => `room:settings:${roomId}`;

export async function getRoomSettings(roomId: string) {
  const key = settingsKey(roomId);
  const resp = await redis.get();
}

export async function updateRoomSettings(roomId: string) {}
