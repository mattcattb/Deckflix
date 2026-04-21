import type {SwipeChoice} from "@deckflix/shared/game-core";
import type {ActiveRoomClient, RoomClient} from "@deckflix/shared/game-sessions";
import type {
  CreateGameResult,
  DisplayGameState,
  GameMeta,
  GamePlayers,
  GameResults,
  JoinGameResult,
  PlayerGameState,
  VoteGameResult,
} from "@deckflix/shared/game-snapshots";
import {
  parseDisplayServerMessage,
  parsePlayerServerMessage,
} from "@deckflix/shared/game-messages";
import {API_BASE_URL, api, throwApiError} from "./api";

const normalizeGameCode = (gameCode: string) => gameCode.trim().toUpperCase();

const expectJson = async <T>(response: Response, label: string) => {
  if (!response.ok) {
    await throwApiError(response, label);
  }

  return (await response.json()) as T;
};

export const gameKeys = {
  activeClient: ["active-room-client"] as const,
  roomClient: (gameCode: string) => ["room-client", normalizeGameCode(gameCode)] as const,
  meta: (gameCode: string) => ["game-meta", normalizeGameCode(gameCode)] as const,
  players: (gameCode: string) => ["game-players", normalizeGameCode(gameCode)] as const,
  results: (gameCode: string) => ["game-results", normalizeGameCode(gameCode)] as const,
  displayState: (gameCode: string) => ["display-state", normalizeGameCode(gameCode)] as const,
  playerState: (gameCode: string) => ["player-state", normalizeGameCode(gameCode)] as const,
};

export const getActiveRoomClient = async () =>
  expectJson<ActiveRoomClient>(
    await api.api.rooms.session.$get(),
    "GET /api/rooms/session",
  );

export const getRoomClient = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  return expectJson<RoomClient>(
    await api.api.rooms[":gameCode"].client.$get({
      param: {gameCode: normalized},
    }),
    `GET /api/rooms/${normalized}/client`,
  );
};

export const getGameMeta = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  return expectJson<GameMeta>(
    await api.api.rooms[":gameCode"].meta.$get({
      param: {gameCode: normalized},
    }),
    `GET /api/rooms/${normalized}/meta`,
  );
};

export const getGamePlayers = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  return expectJson<GamePlayers>(
    await api.api.rooms[":gameCode"].players.$get({
      param: {gameCode: normalized},
    }),
    `GET /api/rooms/${normalized}/players`,
  );
};

export const getGameResults = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  return expectJson<GameResults>(
    await api.api.rooms[":gameCode"].results.$get({
      param: {gameCode: normalized},
    }),
    `GET /api/rooms/${normalized}/results`,
  );
};

export const getDisplayGameState = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  return expectJson<DisplayGameState>(
    await api.api.rooms[":gameCode"].display.state.$get({
      param: {gameCode: normalized},
    }),
    `GET /api/rooms/${normalized}/display/state`,
  );
};

export const getPlayerGameState = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  return expectJson<PlayerGameState>(
    await api.api.rooms[":gameCode"].players.me.$get({
      param: {gameCode: normalized},
    }),
    `GET /api/rooms/${normalized}/players/me`,
  );
};

export const createGame = async (input: {roomName?: string}) =>
  expectJson<CreateGameResult>(
    await api.api.games.$post({
      json: {
        roomName: input.roomName?.trim() || undefined,
      },
    }),
    "POST /api/games",
  );

export const joinGame = async (input: {gameCode: string; displayName: string}) => {
  const normalized = normalizeGameCode(input.gameCode);
  return expectJson<JoinGameResult>(
    await api.api.rooms[":gameCode"].players.$post({
      param: {gameCode: normalized},
      json: {
        displayName: input.displayName.trim(),
      },
    }),
    `POST /api/rooms/${normalized}/players`,
  );
};

export const voteForMovie = async (input: {
  gameCode: string;
  playerId: string;
  assignmentId: string;
  movieId: string;
  choice: SwipeChoice;
}) => {
  const normalized = normalizeGameCode(input.gameCode);
  return expectJson<VoteGameResult>(
    await api.api.rooms[":gameCode"].players[":playerId"].votes.$post({
      param: {
        gameCode: normalized,
        playerId: input.playerId,
      },
      json: {
        assignmentId: input.assignmentId,
        movieId: input.movieId,
        choice: input.choice,
      },
    }),
    `POST /api/rooms/${normalized}/players/${input.playerId}/votes`,
  );
};

export const leaveGame = async (input: {gameCode: string; playerId: string}) => {
  const normalized = normalizeGameCode(input.gameCode);
  const response = await api.api.rooms[":gameCode"].players[":playerId"].leave.$post({
    param: {
      gameCode: normalized,
      playerId: input.playerId,
    },
  });

  if (!response.ok) {
    await throwApiError(
      response,
      `POST /api/rooms/${normalized}/players/${input.playerId}/leave`,
    );
  }
};

export const deleteRoom = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  const response = await api.api.rooms[":gameCode"].$delete({
    param: {gameCode: normalized},
  });

  if (!response.ok) {
    await throwApiError(response, `DELETE /api/rooms/${normalized}`);
  }
};

export const createDisplayWebSocketUrl = (gameCode: string) => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL(`/api/rooms/${normalizeGameCode(gameCode)}/display/ws`, wsBase);
  return url.toString();
};

export const createPlayerWebSocketUrl = (gameCode: string) => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL(`/api/rooms/${normalizeGameCode(gameCode)}/players/ws`, wsBase);
  return url.toString();
};

export {parseDisplayServerMessage, parsePlayerServerMessage};
