import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {
  CreateRoomResult,
  JoinRoomResult,
  MovieCandidate,
  RoomSettings,
  RoomSettingsInput,
  RoomSnapshot,
  SwipeChoice,
} from "@deckflix/shared";
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "../common/errors";
import {ensureRedis, redis} from "../lib/redis";
import * as MoviesService from "../movies/movies.service";

type SocketLike = {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
};

type RoomMemberInternal = {
  id: string;
  displayName: string;
  role: "host" | "guest";
  userId?: string;
  joinedAt: string;
  sessionToken: string;
};

type RoomInternal = {
  id: string;
  code: string;
  status: "lobby" | "swiping" | "completed";
  createdAt: string;
  hostMemberId: string;
  settings: RoomSettings;
  movies: MovieCandidate[];
  members: Record<string, RoomMemberInternal>;
  memberCursorById: Record<string, number>;
  votesByMovieId: Record<string, Record<string, SwipeChoice>>;
  matchedMovieIds: string[];
};

const roomMemberSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  role: z.enum(["host", "guest"]),
  userId: z.string().optional(),
  joinedAt: z.string().datetime(),
  sessionToken: z.string().min(1),
});

const roomStateSchema = z.object({
  id: z.string().min(1),
  code: z.string().min(1),
  status: z.enum(["lobby", "swiping", "completed"]),
  createdAt: z.string().datetime(),
  hostMemberId: z.string().min(1),
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
  members: z.record(z.string(), roomMemberSchema),
  memberCursorById: z.record(z.string(), z.number().int().min(0)),
  votesByMovieId: z.record(
    z.string(),
    z.record(z.string(), z.enum(["like", "dislike", "maybe", "super_like", "skip"])),
  ),
  matchedMovieIds: z.array(z.string()),
});

const DEFAULT_SETTINGS: RoomSettings = {
  minLikesToMatch: 2,
  maxMovies: 15,
  allowMaybe: true,
  allowSuperLike: true,
};

const ROOM_TTL_SECONDS = 60 * 60 * 24;
const socketsByRoomCode = new Map<string, Map<string, Set<SocketLike>>>();

const getRoomKey = (roomCode: string) => `room:${roomCode.trim().toUpperCase()}`;

const generateRoomCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.floor(Math.random() * alphabet.length);
    code += alphabet[idx];
  }
  return code;
};

const mergeSettings = (settings?: RoomSettingsInput): RoomSettings => ({
  ...DEFAULT_SETTINGS,
  ...settings,
});

const saveRoom = async (room: RoomInternal) => {
  await ensureRedis();
  await redis.set(getRoomKey(room.code), JSON.stringify(room), {
    EX: ROOM_TTL_SECONDS,
  });
};

const getRoomOrThrow = async (roomCode: string) => {
  await ensureRedis();
  const normalized = roomCode.trim().toUpperCase();
  const raw = await redis.get(getRoomKey(normalized));
  if (!raw) {
    throw new NotFoundException(`Room ${normalized} not found`);
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    throw new NotFoundException(`Room ${normalized} not found`);
  }

  const parsed = roomStateSchema.safeParse(parsedJson);
  if (!parsed.success) {
    throw new NotFoundException(`Room ${normalized} not found`);
  }

  return parsed.data satisfies RoomInternal;
};

const createUniqueRoomCode = async () => {
  await ensureRedis();
  for (let i = 0; i < 20; i += 1) {
    const candidate = generateRoomCode();
    if (!(await redis.exists(getRoomKey(candidate)))) {
      return candidate;
    }
  }

  throw new BadRequestException("Unable to generate room code");
};

const buildRoomDeck = async (maxMovies: number): Promise<MovieCandidate[]> => {
  const popular = await MoviesService.getPopularMovies({page: 1});
  const items = popular.items.slice(0, maxMovies);

  if (items.length === 0) {
    throw new BadRequestException("No movies available to build deck");
  }

  return items;
};

const computeVoteCounts = (room: RoomInternal, movieId: string) => {
  const votes = room.votesByMovieId[movieId];
  const counts = {
    like: 0,
    dislike: 0,
    maybe: 0,
    superLike: 0,
    skip: 0,
    totalVotes: 0,
  };

  if (!votes) return counts;

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

const allMembersCompleted = (room: RoomInternal) =>
  Object.keys(room.members).every((memberId) => {
    const cursor = room.memberCursorById[memberId] ?? 0;
    return cursor >= room.movies.length;
  });

const verifySession = async (input: {
  roomCode: string;
  memberId: string;
  sessionToken: string;
}) => {
  const room = await getRoomOrThrow(input.roomCode);
  const member = room.members[input.memberId];
  if (!member || member.sessionToken !== input.sessionToken) {
    throw new UnauthorizedException("Invalid room session");
  }

  return {room, member};
};

export const createRoom = async (input: {
  displayName: string;
  userId?: string;
  settings?: RoomSettingsInput;
}): Promise<CreateRoomResult> => {
  const roomCode = await createUniqueRoomCode();
  const memberId = randomUUID();
  const sessionToken = randomUUID();
  const createdAt = new Date().toISOString();
  const settings = mergeSettings(input.settings);
  const movies = await buildRoomDeck(settings.maxMovies);

  const room: RoomInternal = {
    id: randomUUID(),
    code: roomCode,
    status: "lobby",
    createdAt,
    hostMemberId: memberId,
    settings,
    movies,
    members: {
      [memberId]: {
        id: memberId,
        displayName: input.displayName,
        role: "host",
        userId: input.userId,
        joinedAt: createdAt,
        sessionToken,
      },
    },
    memberCursorById: {
      [memberId]: 0,
    },
    votesByMovieId: {},
    matchedMovieIds: [],
  };

  await saveRoom(room);

  return {
    room: await getRoomSnapshot(roomCode),
    session: {
      roomCode,
      memberId,
      sessionToken,
    },
  };
};

export const joinRoom = async (input: {
  roomCode: string;
  displayName: string;
  userId?: string;
}): Promise<JoinRoomResult> => {
  const room = await getRoomOrThrow(input.roomCode);
  const memberId = randomUUID();
  const sessionToken = randomUUID();
  const joinedAt = new Date().toISOString();

  room.members[memberId] = {
    id: memberId,
    displayName: input.displayName,
    role: "guest",
    userId: input.userId,
    joinedAt,
    sessionToken,
  };
  room.memberCursorById[memberId] = 0;

  if (Object.keys(room.members).length >= 2 && room.status === "lobby") {
    room.status = "swiping";
  }

  await saveRoom(room);

  return {
    room: await getRoomSnapshot(room.code),
    session: {
      roomCode: room.code,
      memberId,
      sessionToken,
    },
  };
};

export const getRoomSnapshot = async (roomCode: string): Promise<RoomSnapshot> => {
  const room = await getRoomOrThrow(roomCode);
  const liveSockets = socketsByRoomCode.get(room.code);

  const members = Object.values(room.members).map((member) => ({
    id: member.id,
    displayName: member.displayName,
    role: member.role,
    joinedAt: member.joinedAt,
    connected: Boolean(liveSockets?.get(member.id)?.size),
  }));

  const voteSummary = room.movies.map((movie) => ({
    movieId: movie.id,
    ...computeVoteCounts(room, movie.id),
    matched: room.matchedMovieIds.includes(movie.id),
  }));

  return {
    id: room.id,
    code: room.code,
    status: room.status,
    createdAt: room.createdAt,
    hostMemberId: room.hostMemberId,
    settings: room.settings,
    members,
    movies: room.movies,
    voteSummary,
    deck: {
      items: room.movies.map((movie, index) => ({
        movie,
        order: index,
        votes: voteSummary[index],
      })),
      memberProgress: members.map((member) => {
        const currentIndex = room.memberCursorById[member.id] ?? 0;
        return {
          memberId: member.id,
          currentIndex,
          completed: currentIndex >= room.movies.length,
        };
      }),
      totalCards: room.movies.length,
    },
  };
};

export const connectMember = async (input: {
  roomCode: string;
  memberId: string;
  sessionToken: string;
  socket: SocketLike;
}) => {
  const {room} = await verifySession(input);
  const roomSockets =
    socketsByRoomCode.get(room.code) ?? new Map<string, Set<SocketLike>>();
  const memberSockets = roomSockets.get(input.memberId) ?? new Set<SocketLike>();
  memberSockets.add(input.socket);
  roomSockets.set(input.memberId, memberSockets);
  socketsByRoomCode.set(room.code, roomSockets);
};

export const disconnectMember = (input: {
  roomCode: string;
  memberId: string;
  socket: SocketLike;
}) => {
  const normalized = input.roomCode.trim().toUpperCase();
  const roomSockets = socketsByRoomCode.get(normalized);
  if (!roomSockets) return;

  const memberSockets = roomSockets.get(input.memberId);
  if (!memberSockets) return;

  memberSockets.delete(input.socket);
  if (memberSockets.size === 0) {
    roomSockets.delete(input.memberId);
  }

  if (roomSockets.size === 0) {
    socketsByRoomCode.delete(normalized);
  }
};

export const recordSwipe = async (input: {
  roomCode: string;
  memberId: string;
  sessionToken: string;
  movieId: string;
  choice: SwipeChoice;
}) => {
  const {room} = await verifySession(input);

  if (!room.settings.allowMaybe && input.choice === "maybe") {
    throw new BadRequestException("Maybe swipes are disabled in this room");
  }

  if (!room.settings.allowSuperLike && input.choice === "super_like") {
    throw new BadRequestException("Super like swipes are disabled in this room");
  }

  const cursor = room.memberCursorById[input.memberId] ?? 0;
  const currentMovie = room.movies[cursor];
  if (!currentMovie) {
    throw new BadRequestException("No remaining movies in deck");
  }

  if (currentMovie.id !== input.movieId) {
    throw new BadRequestException("Swipe does not match member deck position");
  }

  room.votesByMovieId[input.movieId] ??= {};
  room.votesByMovieId[input.movieId][input.memberId] = input.choice;
  room.memberCursorById[input.memberId] = cursor + 1;

  const voteCounts = computeVoteCounts(room, input.movieId);
  const likes = voteCounts.like + voteCounts.superLike;
  const justMatched =
    likes >= room.settings.minLikesToMatch &&
    !room.matchedMovieIds.includes(input.movieId);

  if (justMatched) {
    room.matchedMovieIds.push(input.movieId);
    room.status = "completed";
  } else if (allMembersCompleted(room)) {
    room.status = "completed";
  } else if (Object.keys(room.members).length >= 2) {
    room.status = "swiping";
  }

  await saveRoom(room);

  return {
    movieId: input.movieId,
    justMatched,
    snapshot: await getRoomSnapshot(room.code),
  };
};
