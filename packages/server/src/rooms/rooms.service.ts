import {randomUUID} from "node:crypto";
import {z} from "zod";
import type {
  CreateRoomResult,
  JoinRoomResult,
  MovieCandidate,
  RoomParticipantSession,
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
  maxMovies: 100,
  allowMaybe: true,
  allowSuperLike: true,
};

const ROOM_TTL_SECONDS = 60 * 60 * 24;
const ROOM_LOCK_TTL_MS = 5_000;
const ROOM_LOCK_RETRY_COUNT = 40;
const ROOM_LOCK_RETRY_DELAY_MS = 50;
const socketsByRoomCode = new Map<string, Map<string, Set<SocketLike>>>();

const getRoomKey = (roomCode: string) => `room:${roomCode.trim().toUpperCase()}`;
const getRoomLockKey = (roomCode: string) => `${getRoomKey(roomCode)}:lock`;

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

const sleep = (ms: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
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

const releaseRoomLock = async (roomCode: string, token: string) => {
  await redis.eval(
    `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("DEL", KEYS[1])
      end
      return 0
    `,
    {
      keys: [getRoomLockKey(roomCode)],
      arguments: [token],
    },
  );
};

const withRoomLock = async <T>(roomCode: string, callback: () => Promise<T>) => {
  await ensureRedis();
  const normalized = roomCode.trim().toUpperCase();
  const lockToken = randomUUID();

  for (let attempt = 0; attempt < ROOM_LOCK_RETRY_COUNT; attempt += 1) {
    const locked = await redis.set(getRoomLockKey(normalized), lockToken, {
      NX: true,
      PX: ROOM_LOCK_TTL_MS,
    });

    if (!locked) {
      await sleep(ROOM_LOCK_RETRY_DELAY_MS);
      continue;
    }

    try {
      return await callback();
    } finally {
      await releaseRoomLock(normalized, lockToken);
    }
  }

  throw new BadRequestException("Room is busy, please try again");
};

const buildRoomDeck = async (maxMovies: number): Promise<MovieCandidate[]> => {
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

const getMovieVoteSummary = (room: RoomInternal, movieId: string) => {
  const counts = computeVoteCounts(room, movieId);
  return {
    movieId,
    ...counts,
    matched: room.matchedMovieIds.includes(movieId),
  };
};

const allMembersCompleted = (room: RoomInternal) =>
  Object.keys(room.members).every((memberId) => {
    const cursor = room.memberCursorById[memberId] ?? 0;
    return cursor >= room.movies.length;
  });

export const verifyRoomParticipantSession = async (input: {
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
  settings?: RoomSettingsInput;
}): Promise<CreateRoomResult> => {
  const memberId = randomUUID();
  const sessionToken = randomUUID();
  const createdAt = new Date().toISOString();
  const settings = mergeSettings(input.settings);
  const movies = await buildRoomDeck(settings.maxMovies);
  let roomCode: string | null = null;

  await ensureRedis();
  for (let i = 0; i < 20; i += 1) {
    const candidate = generateRoomCode();
    const room: RoomInternal = {
      id: randomUUID(),
      code: candidate,
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

    const created = await redis.set(getRoomKey(candidate), JSON.stringify(room), {
      EX: ROOM_TTL_SECONDS,
      NX: true,
    });

    if (created) {
      roomCode = candidate;
      break;
    }
  }

  if (!roomCode) {
    throw new BadRequestException("Unable to generate room code");
  }

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
}): Promise<JoinRoomResult> => {
  const memberId = randomUUID();
  const sessionToken = randomUUID();
  const joinedAt = new Date().toISOString();
  const room = await withRoomLock(input.roomCode, async () => {
    const nextRoom = await getRoomOrThrow(input.roomCode);

    nextRoom.members[memberId] = {
      id: memberId,
      displayName: input.displayName,
      role: "guest",
      joinedAt,
      sessionToken,
    };
    nextRoom.memberCursorById[memberId] = 0;

    if (Object.keys(nextRoom.members).length >= 2 && nextRoom.status === "lobby") {
      nextRoom.status = "swiping";
    }

    await saveRoom(nextRoom);
    return nextRoom;
  });

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
  return getRoomSnapshotForViewer(roomCode, null);
};

export const getRoomSnapshotForViewer = async (
  roomCode: string,
  viewerMemberId: string | null,
): Promise<RoomSnapshot> => {
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
    ...getMovieVoteSummary(room, movie.id),
  }));

  return {
    id: room.id,
    code: room.code,
    viewerMemberId,
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
  const {room} = await verifyRoomParticipantSession(input);
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
  participant: RoomParticipantSession & {roomCode: string};
  movieId: string;
  choice: SwipeChoice;
}) => {
  const result = await withRoomLock(input.participant.roomCode, async () => {
    const {room} = await verifyRoomParticipantSession(input.participant);
    const memberCount = Object.keys(room.members).length;

    if (memberCount < 2) {
      throw new BadRequestException("Need at least 2 members before swiping");
    }

    if (!room.settings.allowMaybe && input.choice === "maybe") {
      throw new BadRequestException("Maybe swipes are disabled in this room");
    }

    if (!room.settings.allowSuperLike && input.choice === "super_like") {
      throw new BadRequestException("Super like swipes are disabled in this room");
    }

    const cursor = room.memberCursorById[input.participant.memberId] ?? 0;
    const currentMovie = room.movies[cursor];
    if (!currentMovie) {
      throw new BadRequestException("No remaining movies in deck");
    }

    if (currentMovie.id !== input.movieId) {
      throw new BadRequestException("Swipe does not match member deck position");
    }

    room.votesByMovieId[input.movieId] ??= {};
    room.votesByMovieId[input.movieId][input.participant.memberId] = input.choice;
    room.memberCursorById[input.participant.memberId] = cursor + 1;

    const voteCounts = computeVoteCounts(room, input.movieId);
    const likes = voteCounts.like + voteCounts.superLike;
    const cardCompleted = voteCounts.totalVotes === memberCount;
    const justMatched =
      likes >= room.settings.minLikesToMatch &&
      !room.matchedMovieIds.includes(input.movieId);

    if (justMatched) {
      room.matchedMovieIds.push(input.movieId);
    }

    if (allMembersCompleted(room)) {
      room.status = "completed";
    } else if (Object.keys(room.members).length >= 2) {
      room.status = "swiping";
    }

    await saveRoom(room);

    return {
      roomCode: room.code,
      movieId: input.movieId,
      cardCompleted,
      justMatched,
      cardSummary: getMovieVoteSummary(room, input.movieId),
    };
  });

  return {
    movieId: result.movieId,
    cardCompleted: result.cardCompleted,
    justMatched: result.justMatched,
    cardSummary: result.cardSummary,
    snapshot: await getRoomSnapshotForViewer(
      result.roomCode,
      input.participant.memberId,
    ),
  };
};

export const leaveRoom = async (participant: RoomParticipantSession & {roomCode: string}) => {
  return withRoomLock(participant.roomCode, async () => {
    const {room} = await verifyRoomParticipantSession(participant);

    delete room.members[participant.memberId];
    delete room.memberCursorById[participant.memberId];

    for (const votes of Object.values(room.votesByMovieId)) {
      delete votes[participant.memberId];
    }

    if (room.hostMemberId === participant.memberId) {
      const nextHost = Object.values(room.members)
        .sort((a, b) => a.joinedAt.localeCompare(b.joinedAt))[0];
      room.hostMemberId = nextHost?.id ?? "";
    }

    const remainingMembers = Object.keys(room.members).length;
    if (remainingMembers === 0) {
      await ensureRedis();
      await redis.del(getRoomKey(room.code));
      return {deleted: true, roomCode: room.code};
    }

    if (room.status !== "completed") {
      room.status = remainingMembers >= 2 ? "swiping" : "lobby";
    }

    await saveRoom(room);
    return {deleted: false, roomCode: room.code};
  });
};
