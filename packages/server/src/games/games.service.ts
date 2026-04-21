import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {
  ActiveRoomClient,
  CreateGameResult,
  DisplayGameSnapshot,
  DisplaySession,
  GamePlayerPresence,
  GamePublicSnapshot,
  GameSettings,
  GameSettingsInput,
  GameVoteSummary,
  MovieCandidate,
  PlayerGameSnapshot,
  PlayerSession,
  RoomRole,
  RoomSession,
  RoomClientSnapshot,
  SwipeChoice,
} from "@deckflix/shared";
import {activeRoomClientSchema, roomClientSnapshotSchema} from "@deckflix/shared";
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";
import * as MoviesService from "../movies/movies.service";

type SocketLike = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

type DisplayInternal = {
  id: string;
  sessionToken: string;
};

type PlayerInternal = {
  id: string;
  displayName: string;
  joinedAt: string;
  sessionToken: string;
};

type GameInternal = {
  id: string;
  code: string;
  roomName: string | null;
  status: "lobby" | "swiping" | "completed";
  createdAt: string;
  settings: GameSettings;
  movies: MovieCandidate[];
  players: Record<string, PlayerInternal>;
  playerCursorById: Record<string, number>;
  votesByMovieId: Record<string, Record<string, SwipeChoice>>;
  matchedMovieIds: string[];
  display: DisplayInternal;
};

const playerSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1).max(40),
  joinedAt: z.string().datetime(),
  sessionToken: z.string().min(1),
});

const gameStateSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  roomName: z.string().min(1).max(60).nullable(),
  status: z.enum(["lobby", "swiping", "completed"]),
  createdAt: z.string().datetime(),
  settings: z.object({
    minLikesToMatch: z.number().int(),
    maxMovies: z.number().int(),
    allowMaybe: z.boolean(),
    allowSuperLike: z.boolean(),
  }),
  movies: z.array(z.object({
    id: z.string().min(1),
    title: z.string(),
    year: z.number().int(),
    overview: z.string(),
    posterUrl: z.string(),
    rating: z.number(),
  })),
  players: z.record(z.string(), playerSchema),
  playerCursorById: z.record(z.string(), z.number().int().min(0)),
  votesByMovieId: z.record(
    z.string(),
    z.record(z.string(), z.enum(["like", "dislike", "maybe", "super_like", "skip"])),
  ),
  matchedMovieIds: z.array(z.string()),
  display: z.object({
    id: z.string().min(1),
    sessionToken: z.string().min(1),
  }),
});

const DEFAULT_SETTINGS: GameSettings = {
  minLikesToMatch: 2,
  maxMovies: 100,
  allowMaybe: true,
  allowSuperLike: true,
};

const GAME_TTL_SECONDS = 60 * 60 * 24;
const GAME_LOCK_TTL_MS = 5_000;
const GAME_LOCK_RETRY_COUNT = 40;
const GAME_LOCK_RETRY_DELAY_MS = 50;

const displaySocketsByGameCode = new Map<string, Set<SocketLike>>();
const playerSocketsByGameCode = new Map<string, Map<string, Set<SocketLike>>>();

const normalizeGameCode = (gameCode: string) => gameCode.trim().toUpperCase();
const getGameKey = (gameCode: string) => `game:${normalizeGameCode(gameCode)}`;
const getGameLockKey = (gameCode: string) => `${getGameKey(gameCode)}:lock`;

const generateGameCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
};

const mergeSettings = (settings?: GameSettingsInput): GameSettings => ({
  ...DEFAULT_SETTINGS,
  ...settings,
});

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

const saveGame = async (game: GameInternal) => {
  await ensureRedis();
  await redis.set(getGameKey(game.code), JSON.stringify(game), {
    EX: GAME_TTL_SECONDS,
  });
};

const getGameOrThrow = async (gameCode: string) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const raw = await redis.get(getGameKey(normalized));
  if (!raw) {
    throw new NotFoundException(`Game ${normalized} not found`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new NotFoundException(`Game ${normalized} not found`);
  }

  const parsed = gameStateSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new NotFoundException(`Game ${normalized} not found`);
  }

  return parsed.data satisfies GameInternal;
};

const releaseGameLock = async (gameCode: string, token: string) => {
  await redis.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `,
    {
      keys: [getGameLockKey(gameCode)],
      arguments: [token],
    },
  );
};

const withGameLock = async <T>(gameCode: string, callback: () => Promise<T>) => {
  await ensureRedis();
  const normalized = normalizeGameCode(gameCode);
  const lockToken = randomUUID();

  for (let attempt = 0; attempt < GAME_LOCK_RETRY_COUNT; attempt += 1) {
    const locked = await redis.set(getGameLockKey(normalized), lockToken, {
      NX: true,
      PX: GAME_LOCK_TTL_MS,
    });

    if (!locked) {
      await sleep(GAME_LOCK_RETRY_DELAY_MS);
      continue;
    }

    try {
      return await callback();
    } finally {
      await releaseGameLock(normalized, lockToken);
    }
  }

  throw new BadRequestException("Game is busy, please try again");
};

const buildGameQueue = async (maxMovies: number): Promise<MovieCandidate[]> => {
  const items: MovieCandidate[] = [];
  const seenMovieIds = new Set<string>();
  let page = 1;
  let totalPages = 1;

  while (items.length < maxMovies && page <= totalPages) {
    const popular = await MoviesService.getPopularMovies({page});
    totalPages = popular.totalPages;

    for (const movie of popular.items) {
      if (seenMovieIds.has(movie.id)) {
        continue;
      }

      seenMovieIds.add(movie.id);
      items.push(movie);

      if (items.length >= maxMovies) {
        break;
      }
    }

    page += 1;
  }

  if (items.length === 0) {
    throw new BadRequestException("No movies available to build queue");
  }

  return items;
};

const getVoteCounts = (game: GameInternal, movieId: string) => {
  const votes = game.votesByMovieId[movieId];
  const counts = {
    like: 0,
    dislike: 0,
    maybe: 0,
    superLike: 0,
    skip: 0,
    totalVotes: 0,
  };

  if (!votes) {
    return counts;
  }

  for (const choice of Object.values(votes)) {
    counts.totalVotes += 1;
    if (choice === "like") counts.like += 1;
    if (choice === "dislike") counts.dislike += 1;
    if (choice === "maybe") counts.maybe += 1;
    if (choice === "super_like") counts.superLike += 1;
    if (choice === "skip") counts.skip += 1;
  }

  return counts;
};

const getMovieVoteSummary = (game: GameInternal, movieId: string): GameVoteSummary => {
  const counts = getVoteCounts(game, movieId);
  return {
    movieId,
    ...counts,
    matched: game.matchedMovieIds.includes(movieId),
  };
};

const recalculateMatchedMovieIds = (game: GameInternal) => {
  game.matchedMovieIds = game.movies
    .filter((movie) => {
      const counts = getVoteCounts(game, movie.id);
      return counts.like + counts.superLike >= game.settings.minLikesToMatch;
    })
    .map((movie) => movie.id);
};

const allPlayersCompleted = (game: GameInternal) =>
  Object.keys(game.players).every((playerId) => {
    const cursor = game.playerCursorById[playerId] ?? 0;
    return cursor >= game.movies.length;
  });

const buildPlayers = (game: GameInternal): GamePlayerPresence[] => {
  const livePlayerSockets = playerSocketsByGameCode.get(game.code);

  return Object.values(game.players).map((player) => ({
    id: player.id,
    displayName: player.displayName,
    joinedAt: player.joinedAt,
    connectedAsPlayer: Boolean(livePlayerSockets?.get(player.id)?.size),
  }));
};

const buildSummary = (game: GameInternal) => ({
  id: game.id,
  code: game.code,
  roomName: game.roomName,
  status: game.status,
  createdAt: game.createdAt,
  playerCount: Object.keys(game.players).length,
  queueSize: game.movies.length,
  displayConnected: Boolean(displaySocketsByGameCode.get(game.code)?.size),
});

export type ActiveRoomSession = RoomSession;

const buildResults = (game: GameInternal) => ({
  voteSummary: game.movies.map((movie) => getMovieVoteSummary(game, movie.id)),
  matchedMovieIds: [...game.matchedMovieIds],
});

const getRoleConflictMessage = (role: RoomRole) =>
  role === "display"
    ? "This browser already owns the display for this room"
    : "This browser is already joined to this room as a player";

export const verifyDisplaySession = async (input: DisplaySession) => {
  const game = await getGameOrThrow(input.gameCode);
  if (
    game.display.id !== input.displayId ||
    game.display.sessionToken !== input.sessionToken
  ) {
    throw new UnauthorizedException("Invalid display session");
  }

  return {game};
};

export const verifyPlayerSession = async (input: PlayerSession) => {
  const game = await getGameOrThrow(input.gameCode);
  const player = game.players[input.playerId];

  if (!player || player.sessionToken !== input.sessionToken) {
    throw new UnauthorizedException("Invalid player session");
  }

  return {game, player};
};

export const verifyRoomSession = async (session: RoomSession) => {
  if (session.role === "display") {
    await verifyDisplaySession({
      gameCode: session.gameCode,
      displayId: session.roleId,
      sessionToken: session.sessionToken,
    });

    return session;
  }

  await verifyPlayerSession({
    gameCode: session.gameCode,
    playerId: session.roleId,
    sessionToken: session.sessionToken,
  });

  return session;
};

export const assertRoomSessionAvailable = async (session: RoomSession | null) => {
  if (!session) {
    return;
  }

  try {
    await verifyRoomSession(session);
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      return;
    }

    throw error;
  }

  throw new ConflictException(
    `${getRoleConflictMessage(session.role)} in room ${session.gameCode}`,
  );
};

export const getActiveRoomClient = async (
  session: RoomSession | null,
): Promise<ActiveRoomClient> => {
  if (!session) {
    return activeRoomClientSchema.parse({role: "none"});
  }

  try {
    const verified = await verifyRoomSession(session);
    const summary = await getGameSummary(verified.gameCode);
    return activeRoomClientSchema.parse({
      role: verified.role,
      gameCode: verified.gameCode,
      roomName: summary.roomName,
    });
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      return activeRoomClientSchema.parse({role: "none"});
    }

    throw error;
  }
};

export const getRoomClientSnapshot = async (input: {
  gameCode: string;
  session: RoomSession | null;
}): Promise<RoomClientSnapshot> => {
  if (!input.session || input.session.gameCode !== input.gameCode) {
    return roomClientSnapshotSchema.parse({
      role: "none",
      game: await getPublicGameSnapshot(input.gameCode),
    });
  }

  try {
    const verified = await verifyRoomSession(input.session);

    if (verified.role === "display") {
      return roomClientSnapshotSchema.parse({
        role: "display",
        game: await getDisplayGameSnapshot(input.gameCode),
      });
    }

    return roomClientSnapshotSchema.parse({
      role: "player",
      game: await getPlayerGameSnapshot({
        gameCode: input.gameCode,
        playerId: verified.roleId,
      }),
    });
  } catch (error) {
    if (error instanceof UnauthorizedException) {
      return roomClientSnapshotSchema.parse({
        role: "none",
        game: await getPublicGameSnapshot(input.gameCode),
      });
    }

    throw error;
  }
};

export const createGame = async (input: {
  roomName?: string;
  settings?: GameSettingsInput;
}): Promise<CreateGameResult> => {
  const createdAt = new Date().toISOString();
  const settings = mergeSettings(input.settings);
  const roomName = input.roomName?.trim() || null;
  const movies = await buildGameQueue(settings.maxMovies);
  const displayId = randomUUID();
  const sessionToken = randomUUID();
  let gameCode: string | null = null;

  await ensureRedis();

  for (let i = 0; i < 20; i += 1) {
    const candidate = generateGameCode();
    const game: GameInternal = {
      id: randomUUID(),
      code: candidate,
      roomName,
      status: "lobby",
      createdAt,
      settings,
      movies,
      players: {},
      playerCursorById: {},
      votesByMovieId: {},
      matchedMovieIds: [],
      display: {
        id: displayId,
        sessionToken,
      },
    };

    const created = await redis.set(getGameKey(candidate), JSON.stringify(game), {
      EX: GAME_TTL_SECONDS,
      NX: true,
    });

    if (created) {
      gameCode = candidate;
      break;
    }
  }

  if (!gameCode) {
    throw new BadRequestException("Unable to generate game code");
  }

  return {
    game: await getDisplayGameSnapshot(gameCode),
    displaySession: {
      gameCode,
      displayId,
      sessionToken,
    },
  };
};

export const joinGame = async (input: {
  gameCode: string;
  displayName: string;
}) => {
  const playerId = randomUUID();
  const sessionToken = randomUUID();
  const joinedAt = new Date().toISOString();

  const game = await withGameLock(input.gameCode, async () => {
    const nextGame = await getGameOrThrow(input.gameCode);
    nextGame.players[playerId] = {
      id: playerId,
      displayName: input.displayName,
      joinedAt,
      sessionToken,
    };
    nextGame.playerCursorById[playerId] = 0;

    if (Object.keys(nextGame.players).length >= 2 && nextGame.status === "lobby") {
      nextGame.status = "swiping";
    }

    await saveGame(nextGame);
    return nextGame;
  });

  return {
    game: await getPlayerGameSnapshot({
      gameCode: game.code,
      playerId,
    }),
    playerSession: {
      gameCode: game.code,
      playerId,
      sessionToken,
    },
    player: {
      id: playerId,
      displayName: input.displayName,
      joinedAt,
      connectedAsPlayer: false,
    } satisfies GamePlayerPresence,
  };
};

export const getPublicGameSnapshot = async (gameCode: string): Promise<GamePublicSnapshot> => {
  const game = await getGameOrThrow(gameCode);

  return {
    summary: buildSummary(game),
    settings: game.settings,
    players: buildPlayers(game),
  };
};

export const getGameSummary = async (gameCode: string) => {
  const game = await getGameOrThrow(gameCode);
  return buildSummary(game);
};

export const getDisplayGameSnapshot = async (gameCode: string): Promise<DisplayGameSnapshot> => {
  const game = await getGameOrThrow(gameCode);

  return {
    summary: buildSummary(game),
    settings: game.settings,
    players: buildPlayers(game),
    queue: game.movies.map((movie, index) => ({
      movie,
      order: index,
    })),
    playerProgress: Object.values(game.players).map((player) => {
      const currentIndex = game.playerCursorById[player.id] ?? 0;
      return {
        playerId: player.id,
        currentIndex,
        completed: currentIndex >= game.movies.length,
      };
    }),
    results: buildResults(game),
  };
};

export const getPlayerGameSnapshot = async (input: {
  gameCode: string;
  playerId: string;
}): Promise<PlayerGameSnapshot> => {
  const game = await getGameOrThrow(input.gameCode);
  const player = game.players[input.playerId];

  if (!player) {
    throw new UnauthorizedException("Player not found");
  }

  const currentIndex = game.playerCursorById[input.playerId] ?? 0;
  const currentMovie = game.movies[currentIndex] ?? null;

  return {
    summary: buildSummary(game),
    settings: game.settings,
    players: buildPlayers(game),
    me: {
      playerId: player.id,
      displayName: player.displayName,
      currentIndex,
      completed: currentIndex >= game.movies.length,
    },
    currentItem: currentMovie
      ? {
          movie: currentMovie,
          order: currentIndex,
        }
      : null,
    remainingCount: Math.max(0, game.movies.length - currentIndex),
    results: buildResults(game),
  };
};

export const getGamePlayerIds = async (gameCode: string) => {
  const game = await getGameOrThrow(gameCode);
  return Object.keys(game.players);
};

export const connectDisplay = async (input: DisplaySession & {socket: SocketLike}) => {
  await verifyDisplaySession(input);
  const displaySockets = displaySocketsByGameCode.get(input.gameCode) ?? new Set<SocketLike>();
  displaySockets.add(input.socket);
  displaySocketsByGameCode.set(input.gameCode, displaySockets);
};

export const disconnectDisplay = (input: {gameCode: string; socket: SocketLike}) => {
  const gameCode = normalizeGameCode(input.gameCode);
  const displaySockets = displaySocketsByGameCode.get(gameCode);
  if (!displaySockets) {
    return;
  }

  displaySockets.delete(input.socket);
  if (displaySockets.size === 0) {
    displaySocketsByGameCode.delete(gameCode);
  }
};

export const connectPlayer = async (input: PlayerSession & {socket: SocketLike}) => {
  const {game} = await verifyPlayerSession(input);
  const gameSockets = playerSocketsByGameCode.get(game.code) ?? new Map<string, Set<SocketLike>>();
  const playerSockets = gameSockets.get(input.playerId) ?? new Set<SocketLike>();
  playerSockets.add(input.socket);
  gameSockets.set(input.playerId, playerSockets);
  playerSocketsByGameCode.set(game.code, gameSockets);
};

export const disconnectPlayer = (input: {
  gameCode: string;
  playerId: string;
  socket: SocketLike;
}) => {
  const gameCode = normalizeGameCode(input.gameCode);
  const gameSockets = playerSocketsByGameCode.get(gameCode);
  if (!gameSockets) {
    return;
  }

  const playerSockets = gameSockets.get(input.playerId);
  if (!playerSockets) {
    return;
  }

  playerSockets.delete(input.socket);
  if (playerSockets.size === 0) {
    gameSockets.delete(input.playerId);
  }

  if (gameSockets.size === 0) {
    playerSocketsByGameCode.delete(gameCode);
  }
};

export const recordVote = async (input: {
  player: PlayerSession;
  movieId: string;
  choice: SwipeChoice;
}) => {
  const result = await withGameLock(input.player.gameCode, async () => {
    const {game} = await verifyPlayerSession(input.player);
    const playerCount = Object.keys(game.players).length;

    if (playerCount < 2) {
      throw new BadRequestException("Need at least 2 players before voting");
    }

    if (!game.settings.allowMaybe && input.choice === "maybe") {
      throw new BadRequestException("Maybe votes are disabled in this game");
    }

    if (!game.settings.allowSuperLike && input.choice === "super_like") {
      throw new BadRequestException("Super likes are disabled in this game");
    }

    const cursor = game.playerCursorById[input.player.playerId] ?? 0;
    const currentMovie = game.movies[cursor];

    if (!currentMovie) {
      throw new BadRequestException("No remaining movies in queue");
    }

    if (currentMovie.id !== input.movieId) {
      throw new BadRequestException("Vote does not match player queue position");
    }

    game.votesByMovieId[input.movieId] ??= {};
    game.votesByMovieId[input.movieId][input.player.playerId] = input.choice;
    game.playerCursorById[input.player.playerId] = cursor + 1;

    const beforeMatched = new Set(game.matchedMovieIds);
    recalculateMatchedMovieIds(game);
    const justMatched = game.matchedMovieIds.includes(input.movieId) && !beforeMatched.has(input.movieId);

    if (allPlayersCompleted(game)) {
      game.status = "completed";
    } else if (Object.keys(game.players).length >= 2) {
      game.status = "swiping";
    } else {
      game.status = "lobby";
    }

    await saveGame(game);

    return {
      gameCode: game.code,
      movieId: input.movieId,
      choice: input.choice,
      justMatched,
    };
  });

  return {
    movieId: result.movieId,
    choice: result.choice,
    justMatched: result.justMatched,
    game: await getPlayerGameSnapshot({
      gameCode: result.gameCode,
      playerId: input.player.playerId,
    }),
  };
};

export const leaveGame = async (player: PlayerSession) => {
  return withGameLock(player.gameCode, async () => {
    const {game} = await verifyPlayerSession(player);

    delete game.players[player.playerId];
    delete game.playerCursorById[player.playerId];

    for (const votes of Object.values(game.votesByMovieId)) {
      delete votes[player.playerId];
    }

    recalculateMatchedMovieIds(game);

    const remainingPlayers = Object.keys(game.players).length;
    if (game.status !== "completed") {
      game.status = remainingPlayers >= 2 ? "swiping" : "lobby";
    }

    await saveGame(game);
    return {gameCode: game.code};
  });
};

export const deleteGame = async (input: DisplaySession) => {
  const gameCode = normalizeGameCode(input.gameCode);
  await verifyDisplaySession({
    gameCode,
    displayId: input.displayId,
    sessionToken: input.sessionToken,
  });
  await ensureRedis();
  await redis.del(getGameKey(gameCode));
  displaySocketsByGameCode.delete(gameCode);
  playerSocketsByGameCode.delete(gameCode);
};
