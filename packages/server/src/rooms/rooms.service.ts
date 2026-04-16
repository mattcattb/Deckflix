import {randomUUID} from "node:crypto";
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
  members: Map<string, RoomMemberInternal>;
  memberCursorById: Map<string, number>;
  votesByMovieId: Map<string, Map<string, SwipeChoice>>;
  matchedMovieIds: Set<string>;
};

const DEFAULT_SETTINGS: RoomSettings = {
  minLikesToMatch: 2,
  maxMovies: 15,
  allowMaybe: true,
  allowSuperLike: true,
};

const roomsByCode = new Map<string, RoomInternal>();
const socketsByRoomCode = new Map<string, Map<string, Set<SocketLike>>>();

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

const createUniqueRoomCode = () => {
  for (let i = 0; i < 20; i += 1) {
    const candidate = generateRoomCode();
    if (!roomsByCode.has(candidate)) {
      return candidate;
    }
  }

  throw new BadRequestException("Unable to generate room code");
};

const getRoomOrThrow = (roomCode: string) => {
  const normalized = roomCode.trim().toUpperCase();
  const room = roomsByCode.get(normalized);
  if (!room) {
    throw new NotFoundException(`Room ${normalized} not found`);
  }
  return room;
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
  const votes = room.votesByMovieId.get(movieId);
  const counts = {
    like: 0,
    dislike: 0,
    maybe: 0,
    superLike: 0,
    skip: 0,
    totalVotes: 0,
  };

  if (!votes) return counts;

  for (const choice of votes.values()) {
    counts.totalVotes += 1;
    if (choice === "like") counts.like += 1;
    if (choice === "dislike") counts.dislike += 1;
    if (choice === "maybe") counts.maybe += 1;
    if (choice === "super_like") counts.superLike += 1;
    if (choice === "skip") counts.skip += 1;
  }

  return counts;
};

const allMembersCompleted = (room: RoomInternal) => {
  for (const member of room.members.values()) {
    const cursor = room.memberCursorById.get(member.id) ?? 0;
    if (cursor < room.movies.length) {
      return false;
    }
  }

  return true;
};

const verifySession = (input: {
  roomCode: string;
  memberId: string;
  sessionToken: string;
}) => {
  const room = getRoomOrThrow(input.roomCode);
  const member = room.members.get(input.memberId);
  if (!member || member.sessionToken !== input.sessionToken) {
    throw new UnauthorizedException("Invalid room session");
  }

  return {
    room,
    member,
  };
};

export const createRoom = async (input: {
  displayName: string;
  userId?: string;
  settings?: RoomSettingsInput;
}): Promise<CreateRoomResult> => {
  const roomCode = createUniqueRoomCode();
  const memberId = randomUUID();
  const sessionToken = randomUUID();
  const createdAt = new Date().toISOString();
  const settings = mergeSettings(input.settings);
  const movies = await buildRoomDeck(settings.maxMovies);

  roomsByCode.set(roomCode, {
    id: randomUUID(),
    code: roomCode,
    status: "lobby",
    createdAt,
    hostMemberId: memberId,
    settings,
    movies,
    members: new Map([
      [
        memberId,
        {
          id: memberId,
          displayName: input.displayName,
          role: "host",
          userId: input.userId,
          joinedAt: createdAt,
          sessionToken,
        },
      ],
    ]),
    memberCursorById: new Map([[memberId, 0]]),
    votesByMovieId: new Map(),
    matchedMovieIds: new Set(),
  });

  return {
    room: getRoomSnapshot(roomCode),
    session: {
      roomCode,
      memberId,
      sessionToken,
    },
  };
};

export const joinRoom = (input: {
  roomCode: string;
  displayName: string;
  userId?: string;
}): JoinRoomResult => {
  const room = getRoomOrThrow(input.roomCode);
  const memberId = randomUUID();
  const sessionToken = randomUUID();
  const joinedAt = new Date().toISOString();

  room.members.set(memberId, {
    id: memberId,
    displayName: input.displayName,
    role: "guest",
    userId: input.userId,
    joinedAt,
    sessionToken,
  });
  room.memberCursorById.set(memberId, 0);

  if (room.members.size >= 2 && room.status === "lobby") {
    room.status = "swiping";
  }

  return {
    room: getRoomSnapshot(room.code),
    session: {
      roomCode: room.code,
      memberId,
      sessionToken,
    },
  };
};

export const getRoomSnapshot = (roomCode: string): RoomSnapshot => {
  const room = getRoomOrThrow(roomCode);
  const liveSockets = socketsByRoomCode.get(room.code);

  const members = Array.from(room.members.values()).map((member) => ({
    id: member.id,
    displayName: member.displayName,
    role: member.role,
    joinedAt: member.joinedAt,
    connected: Boolean(liveSockets?.get(member.id)?.size),
  }));

  const voteSummary = room.movies.map((movie) => ({
    movieId: movie.id,
    ...computeVoteCounts(room, movie.id),
    matched: room.matchedMovieIds.has(movie.id),
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
        const currentIndex = room.memberCursorById.get(member.id) ?? 0;
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

export const connectMember = (input: {
  roomCode: string;
  memberId: string;
  sessionToken: string;
  socket: SocketLike;
}) => {
  const {room} = verifySession(input);
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
  const roomSockets = socketsByRoomCode.get(input.roomCode);
  if (!roomSockets) return;

  const memberSockets = roomSockets.get(input.memberId);
  if (!memberSockets) return;

  memberSockets.delete(input.socket);
  if (memberSockets.size === 0) {
    roomSockets.delete(input.memberId);
  }

  if (roomSockets.size === 0) {
    socketsByRoomCode.delete(input.roomCode);
  }
};

export const recordSwipe = (input: {
  roomCode: string;
  memberId: string;
  sessionToken: string;
  movieId: string;
  choice: SwipeChoice;
}) => {
  const {room} = verifySession(input);

  if (!room.settings.allowMaybe && input.choice === "maybe") {
    throw new BadRequestException("Maybe swipes are disabled in this room");
  }

  if (!room.settings.allowSuperLike && input.choice === "super_like") {
    throw new BadRequestException("Super like swipes are disabled in this room");
  }

  const cursor = room.memberCursorById.get(input.memberId) ?? 0;
  const currentMovie = room.movies[cursor];
  if (!currentMovie) {
    throw new BadRequestException("No remaining movies in deck");
  }

  if (currentMovie.id !== input.movieId) {
    throw new BadRequestException("Swipe does not match member deck position");
  }

  const votesForMovie =
    room.votesByMovieId.get(input.movieId) ?? new Map<string, SwipeChoice>();
  votesForMovie.set(input.memberId, input.choice);
  room.votesByMovieId.set(input.movieId, votesForMovie);
  room.memberCursorById.set(input.memberId, cursor + 1);

  const voteCounts = computeVoteCounts(room, input.movieId);
  const likes = voteCounts.like + voteCounts.superLike;
  const justMatched =
    likes >= room.settings.minLikesToMatch &&
    !room.matchedMovieIds.has(input.movieId);

  if (justMatched) {
    room.matchedMovieIds.add(input.movieId);
    room.status = "completed";
  } else if (allMembersCompleted(room)) {
    room.status = "completed";
  } else if (room.members.size >= 2) {
    room.status = "swiping";
  }

  return {
    movieId: input.movieId,
    justMatched,
    snapshot: getRoomSnapshot(room.code),
  };
};
