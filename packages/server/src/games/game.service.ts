import {randomUUID} from "node:crypto";
import type {CreateGameResult, GameSettingsInput} from "@deckflix/shared";
import {BadRequestException} from "../common/errors";
import * as GamePoolService from "./game-pool.service";
import {clearPresenceState} from "../ws/presence.ws";
import * as GameRedisService from "./game-redis.service";
import * as GameSessionService from "./game-session.service";
import * as GameSettingsService from "../settings/game-settings.service";
import * as RoomMetaService from "../rooms/room-meta.service";

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
  const settings = GameSettingsService.resolveGameSettings(input.settings);
  const roomName = input.roomName?.trim() || null;
  const movies = await GamePoolService.buildInitialPool({settings});
  const displayId = randomUUID();
  const sessionToken = randomUUID();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const gameCode = generateGameCode();
    const created = await RoomMetaService.createGameMeta({
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
      await GamePoolService.saveInitialPool(gameCode, movies);
      await GameSettingsService.setGameSettings(gameCode, settings);
      await GameRedisService.touchRoomKeys(gameCode);
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
  GameRedisService.withGameLock(input.gameCode, async () => {
    await GameSessionService.verifyDisplaySession({
      gameCode: input.gameCode,
      displayId: input.displayId,
      sessionToken: input.sessionToken,
    });

    await GameRedisService.deleteRoomKeys(input.gameCode);
    clearPresenceState(input.gameCode);
  });
