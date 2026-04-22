import type {GameSettings, GameSettingsInput, SwipeChoice} from "@deckflix/shared/game-core";
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
  settingsDefaults: ["game-settings-defaults"] as const,
  movieGenres: (language = "en-US") => ["movie-genres", language] as const,
  roomClient: (gameCode: string) => ["room-client", normalizeGameCode(gameCode)] as const,
  meta: (gameCode: string) => ["game-meta", normalizeGameCode(gameCode)] as const,
  players: (gameCode: string) => ["game-players", normalizeGameCode(gameCode)] as const,
  results: (gameCode: string) => ["game-results", normalizeGameCode(gameCode)] as const,
  displayState: (gameCode: string) => ["display-state", normalizeGameCode(gameCode)] as const,
  playerState: (gameCode: string) => ["player-state", normalizeGameCode(gameCode)] as const,
};

export type SelectableMovieGenre = {
  id: number;
  name: string;
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

export const getActiveRoomClientRole = async () =>
  expectJson<RoomClient>(
    await api.api.rooms.me.client.$get(),
    "GET /api/rooms/me/client",
  );

export const getGameMeta = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  return expectJson<GameMeta>(
    await api.api.rooms[":gameCode"].meta.$get({
      param: {gameCode: normalized},
    }),
    `GET /api/rooms/${normalized}/meta`,
  );
};

export const getActiveGameMeta = async () =>
  expectJson<GameMeta>(
    await api.api.rooms.me.meta.$get(),
    "GET /api/rooms/me/meta",
  );

export const getGamePlayers = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  return expectJson<GamePlayers>(
    await api.api.rooms[":gameCode"].players.$get({
      param: {gameCode: normalized},
    }),
    `GET /api/rooms/${normalized}/players`,
  );
};

export const getActiveGamePlayers = async () =>
  expectJson<GamePlayers>(
    await api.api.rooms.me.players.$get(),
    "GET /api/rooms/me/players",
  );

export const getGameResults = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  return expectJson<GameResults>(
    await api.api.rooms[":gameCode"].results.$get({
      param: {gameCode: normalized},
    }),
    `GET /api/rooms/${normalized}/results`,
  );
};

export const getActiveGameResults = async () =>
  expectJson<GameResults>(
    await api.api.rooms.me.results.$get(),
    "GET /api/rooms/me/results",
  );

export const getDisplayGameState = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  return expectJson<DisplayGameState>(
    await api.api.rooms[":gameCode"].display.state.$get({
      param: {gameCode: normalized},
    }),
    `GET /api/rooms/${normalized}/display/state`,
  );
};

export const getActiveDisplayGameState = async () =>
  expectJson<DisplayGameState>(
    await api.api.rooms.me.display.state.$get(),
    "GET /api/rooms/me/display/state",
  );

export const getPlayerGameState = async (gameCode: string) => {
  const normalized = normalizeGameCode(gameCode);
  return expectJson<PlayerGameState>(
    await api.api.rooms[":gameCode"].players.me.$get({
      param: {gameCode: normalized},
    }),
    `GET /api/rooms/${normalized}/players/me`,
  );
};

export const getActivePlayerGameState = async () =>
  expectJson<PlayerGameState>(
    await api.api.rooms.me.player.state.$get(),
    "GET /api/rooms/me/player/state",
  );

export const getGameSettingsDefaults = async () =>
  expectJson<{defaults: GameSettings}>(
    await api.api.settings.game.$get(),
    "GET /api/settings/game",
  );

export const getSelectableMovieGenres = async (language = "en-US") =>
  expectJson<{items: SelectableMovieGenre[]}>(
    await api.api.settings.game["movie-genres"].$get({
      query: {language},
    }),
    "GET /api/settings/game/movie-genres",
  );

export const createGame = async (input: {
  roomName?: string;
  settings?: GameSettingsInput;
}) =>
  expectJson<CreateGameResult>(
    await api.api.games.$post({
      json: {
        roomName: input.roomName?.trim() || undefined,
        settings: input.settings,
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

export const voteForActiveMovie = async (input: {
  assignmentId: string;
  movieId: string;
  choice: SwipeChoice;
}) =>
  expectJson<VoteGameResult>(
    await api.api.rooms.me.player.votes.$post({
      json: {
        assignmentId: input.assignmentId,
        movieId: input.movieId,
        choice: input.choice,
      },
    }),
    "POST /api/rooms/me/player/votes",
  );

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

export const leaveActiveGame = async () => {
  const response = await api.api.rooms.me.player.leave.$post();

  if (!response.ok) {
    await throwApiError(response, "POST /api/rooms/me/player/leave");
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

export const deleteActiveRoom = async () => {
  const response = await api.api.rooms.me.$delete();

  if (!response.ok) {
    await throwApiError(response, "DELETE /api/rooms/me");
  }
};

export const createDisplayWebSocketUrl = (gameCode: string) => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL(`/api/rooms/${normalizeGameCode(gameCode)}/display/ws`, wsBase);
  return url.toString();
};

export const createActiveDisplayWebSocketUrl = () => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL("/api/rooms/me/display/ws", wsBase);
  return url.toString();
};

export const createPlayerWebSocketUrl = (gameCode: string) => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL(`/api/rooms/${normalizeGameCode(gameCode)}/players/ws`, wsBase);
  return url.toString();
};

export const createActivePlayerWebSocketUrl = () => {
  const wsBase = API_BASE_URL.replace(/^http/, "ws");
  const url = new URL("/api/rooms/me/player/ws", wsBase);
  return url.toString();
};

export {parseDisplayServerMessage, parsePlayerServerMessage};
