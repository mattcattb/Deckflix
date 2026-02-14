import { randomUUID } from "node:crypto";
import type {
  CreateRoomResult,
  JoinRoomResult,
  MovieCandidate,
  RoomSettings,
  RoomSnapshot,
  SwipeChoice,
} from "@matty-stack/shared";
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "../common/errors";
import { moviesService } from "../movies/movies.service";
import type { RoomSettingsInput } from "./rooms.schema";

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

const generateRoomCode = () => {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.floor(Math.random() * alphabet.length);
    code += alphabet[idx];
  }
  return code;
};

class RoomService {
  private readonly roomsByCode = new Map<string, RoomInternal>();
  private readonly socketsByRoomCode = new Map<string, Map<string, Set<SocketLike>>>();

  async createRoom(input: {
    displayName: string;
    userId?: string;
    settings?: RoomSettingsInput;
  }): Promise<CreateRoomResult> {
    const roomCode = this.createUniqueRoomCode();
    const memberId = randomUUID();
    const sessionToken = randomUUID();
    const createdAt = new Date().toISOString();
    const settings = this.mergeSettings(input.settings);
    const movies = await this.buildRoomDeck(settings.maxMovies);

    const room: RoomInternal = {
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
    };

    this.roomsByCode.set(roomCode, room);

    return {
      room: this.getRoomSnapshot(roomCode),
      session: {
        roomCode,
        memberId,
        sessionToken,
      },
    };
  }

  joinRoom(input: {
    roomCode: string;
    displayName: string;
    userId?: string;
  }): JoinRoomResult {
    const room = this.getRoomOrThrow(input.roomCode);
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
      room: this.getRoomSnapshot(room.code),
      session: {
        roomCode: room.code,
        memberId,
        sessionToken,
      },
    };
  }

  getRoomSnapshot(roomCode: string): RoomSnapshot {
    const room = this.getRoomOrThrow(roomCode);
    const liveSockets = this.socketsByRoomCode.get(room.code);

    const members = Array.from(room.members.values()).map((member) => ({
      id: member.id,
      displayName: member.displayName,
      role: member.role,
      joinedAt: member.joinedAt,
      connected: Boolean(liveSockets?.get(member.id)?.size),
    }));

    const voteSummary = room.movies.map((movie) => {
      const counts = this.computeVoteCounts(room, movie.id);
      return {
        movieId: movie.id,
        ...counts,
        matched: room.matchedMovieIds.has(movie.id),
      };
    });

    const items = room.movies.map((movie, index) => ({
      movie,
      order: index,
      votes: voteSummary[index],
    }));

    const memberProgress = members.map((member) => {
      const currentIndex = room.memberCursorById.get(member.id) ?? 0;
      return {
        memberId: member.id,
        currentIndex,
        completed: currentIndex >= room.movies.length,
      };
    });

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
        items,
        memberProgress,
        totalCards: room.movies.length,
      },
    };
  }

  verifySession(input: {
    roomCode: string;
    memberId: string;
    sessionToken: string;
  }) {
    const room = this.getRoomOrThrow(input.roomCode);
    const member = room.members.get(input.memberId);
    if (!member || member.sessionToken !== input.sessionToken) {
      throw new UnauthorizedException("Invalid room session");
    }
    return {
      room,
      member,
    };
  }

  connectMember(input: {
    roomCode: string;
    memberId: string;
    sessionToken: string;
    socket: SocketLike;
  }) {
    const { room } = this.verifySession(input);
    const roomSockets =
      this.socketsByRoomCode.get(room.code) ?? new Map<string, Set<SocketLike>>();
    const memberSockets = roomSockets.get(input.memberId) ?? new Set<SocketLike>();
    memberSockets.add(input.socket);
    roomSockets.set(input.memberId, memberSockets);
    this.socketsByRoomCode.set(room.code, roomSockets);
  }

  disconnectMember(input: {
    roomCode: string;
    memberId: string;
    socket: SocketLike;
  }) {
    const roomSockets = this.socketsByRoomCode.get(input.roomCode);
    if (!roomSockets) return;

    const memberSockets = roomSockets.get(input.memberId);
    if (!memberSockets) return;

    memberSockets.delete(input.socket);
    if (memberSockets.size === 0) {
      roomSockets.delete(input.memberId);
    }

    if (roomSockets.size === 0) {
      this.socketsByRoomCode.delete(input.roomCode);
    }
  }

  recordSwipe(input: {
    roomCode: string;
    memberId: string;
    sessionToken: string;
    movieId: string;
    choice: SwipeChoice;
  }) {
    const { room } = this.verifySession(input);

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

    const voteCounts = this.computeVoteCounts(room, input.movieId);
    const likes = voteCounts.like + voteCounts.superLike;
    const nowMatched =
      likes >= room.settings.minLikesToMatch && !room.matchedMovieIds.has(input.movieId);

    if (nowMatched) {
      room.matchedMovieIds.add(input.movieId);
      room.status = "completed";
    } else if (this.allMembersCompleted(room)) {
      room.status = "completed";
    } else if (room.members.size >= 2) {
      room.status = "swiping";
    }

    return {
      movieId: input.movieId,
      justMatched: nowMatched,
      snapshot: this.getRoomSnapshot(room.code),
    };
  }

  broadcast(roomCode: string, message: unknown) {
    const serialized = JSON.stringify(message);
    const roomSockets = this.socketsByRoomCode.get(roomCode);
    if (!roomSockets) return;

    for (const sockets of roomSockets.values()) {
      for (const socket of sockets) {
        socket.send(serialized);
      }
    }
  }

  private allMembersCompleted(room: RoomInternal) {
    for (const member of room.members.values()) {
      const cursor = room.memberCursorById.get(member.id) ?? 0;
      if (cursor < room.movies.length) {
        return false;
      }
    }
    return true;
  }

  private computeVoteCounts(room: RoomInternal, movieId: string) {
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
  }

  private mergeSettings(settings?: RoomSettingsInput): RoomSettings {
    return {
      ...DEFAULT_SETTINGS,
      ...settings,
    };
  }

  private createUniqueRoomCode() {
    for (let i = 0; i < 20; i += 1) {
      const candidate = generateRoomCode();
      if (!this.roomsByCode.has(candidate)) {
        return candidate;
      }
    }
    throw new BadRequestException("Unable to generate room code");
  }

  private async buildRoomDeck(maxMovies: number): Promise<MovieCandidate[]> {
    const popular = await moviesService.getPopularMovies({ page: 1 });
    const items = popular.items.slice(0, maxMovies);

    if (items.length === 0) {
      throw new BadRequestException("No movies available to build deck");
    }

    return items;
  }

  private getRoomOrThrow(roomCode: string) {
    const normalized = roomCode.trim().toUpperCase();
    const room = this.roomsByCode.get(normalized);
    if (!room) {
      throw new NotFoundException(`Room ${normalized} not found`);
    }
    return room;
  }
}

export const roomService = new RoomService();
