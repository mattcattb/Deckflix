import {randomUUID} from "node:crypto";
import type {CreateGameResult, GameSettingsInput} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import {buildInitialPool, saveInitialPool} from "./game-pool.service";
import {clearPresenceState} from "./game-presence.service";
import {
  deleteRoomKeys,
  touchRoomKeys,
  withGameLock,
} from "./game-redis.service";
import {verifyDisplaySession} from "./game-session.service";
import {resolveGameSettings, setGameSettings} from "../settings/game-settings.service";
import {createGameMeta} from "../rooms/room-meta.service";

const generateGameCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

export const createGame = async (input: {
  roomName?: string;
  settings?: GameSettingsInput;
}): Promise<CreateGameResult> => {
  const createdAt = new Date().toISOString();
  const settings = resolveGameSettings(input.settings);
  const roomName = input.roomName?.trim() || null;
  const movies = await buildInitialPool({settings});
  const displayId = randomUUID();
  const sessionToken = randomUUID();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const gameCode = generateGameCode();
    const created = await createGameMeta({
      id: randomUUID(),
      code: gameCode,
      roomName,
      status: "lobby",
      createdAt,
      endedAt: null,
      display: {
        id: displayId,
        sessionToken,
      },
    });

    if (created) {
      await saveInitialPool(gameCode, movies);
      await setGameSettings(gameCode, settings);
      await touchRoomKeys(gameCode);
      return {
        gameCode,
        displaySession: {
          gameCode,
          displayId,
          sessionToken,
        },
      };
    }
  }

  throw new BadRequestException("Unable to generate game code");
};

export const deleteGame = async (input: {
  gameCode: string;
  displayId: string;
  sessionToken: string;
}) =>
  withGameLock(input.gameCode, async () => {
    await verifyDisplaySession({
      gameCode: input.gameCode,
      displayId: input.displayId,
      sessionToken: input.sessionToken,
    });

    await deleteRoomKeys(input.gameCode);
    clearPresenceState(input.gameCode);
  });
