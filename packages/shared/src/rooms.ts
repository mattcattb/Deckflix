export const swipeChoices = [
  "like",
  "dislike",
  "maybe",
  "super_like",
  "skip",
] as const;

export type SwipeChoice = (typeof swipeChoices)[number];

export type RoomStatus = "lobby" | "swiping" | "completed";
export type MemberRole = "host" | "guest";

export type RoomSettings = {
  minLikesToMatch: number;
  maxMovies: number;
  allowMaybe: boolean;
  allowSuperLike: boolean;
};

export type MovieCandidate = {
  id: string;
  title: string;
  year: number;
  overview: string;
  posterUrl: string;
  rating: number;
};

export type MovieVoteSummary = {
  movieId: string;
  like: number;
  dislike: number;
  maybe: number;
  superLike: number;
  skip: number;
  totalVotes: number;
  matched: boolean;
};

export type RoomDeckItem = {
  movie: MovieCandidate;
  order: number;
  votes: MovieVoteSummary;
};

export type RoomMemberProgress = {
  memberId: string;
  currentIndex: number;
  completed: boolean;
};

export type RoomMemberSnapshot = {
  id: string;
  displayName: string;
  role: MemberRole;
  joinedAt: string;
  connected: boolean;
};

export type RoomSnapshot = {
  id: string;
  code: string;
  status: RoomStatus;
  createdAt: string;
  hostMemberId: string;
  settings: RoomSettings;
  members: RoomMemberSnapshot[];
  movies: MovieCandidate[];
  voteSummary: MovieVoteSummary[];
  deck: {
    items: RoomDeckItem[];
    memberProgress: RoomMemberProgress[];
    totalCards: number;
  };
};

export type RoomSession = {
  roomCode: string;
  memberId: string;
  sessionToken: string;
};

export type CreateRoomPayload = {
  displayName: string;
  settings?: Partial<RoomSettings>;
};

export type JoinRoomPayload = {
  displayName: string;
};

export type CreateRoomResult = {
  room: RoomSnapshot;
  session: RoomSession;
};

export type JoinRoomResult = {
  room: RoomSnapshot;
  session: RoomSession;
};

export type RoomClientMessage =
  | {
      type: "movie.swipe";
      payload: {
        movieId: string;
        choice: SwipeChoice;
      };
    }
  | {
      type: "ping";
    };

export type RoomServerMessage =
  | {
      type: "room.snapshot";
      payload: RoomSnapshot;
    }
  | {
      type: "room.match_found";
      payload: {
        movieId: string;
      };
    }
  | {
      type: "room.error";
      payload: {
        message: string;
      };
    }
  | {
      type: "pong";
    };
