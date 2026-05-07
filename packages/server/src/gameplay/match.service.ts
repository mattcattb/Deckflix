import type {SwipeChoice} from "@deckflix/shared";
import type {MovieState} from "./movie-state.service";

export const getVoteCountField = (choice: SwipeChoice) => {
  switch (choice) {
    case "like":
      return "likeCount";
    case "dislike":
      return "dislikeCount";
    case "maybe":
      return "maybeCount";
    case "super_like":
      return "superLikeCount";
    case "skip":
      return "skipCount";
  }
};

export const resolveMovieState = (input: {
  state: MovieState;
  totalPlayers: number;
  votedAt: string;
}) => {
  const previousStatus = input.state.status;
  const state: MovieState = {
    ...input.state,
    lastActivityAt: input.votedAt,
    resolvedAt: input.state.resolvedAt ?? null,
    matchedAt: input.state.matchedAt ?? null,
  };

  const positiveVotes = state.likeCount + state.superLikeCount;
  const hasBlockingVote =
    state.dislikeCount > 0 || state.maybeCount > 0 || state.skipCount > 0;

  if (
    input.totalPlayers > 0 &&
    state.totalVotes === input.totalPlayers &&
    positiveVotes === input.totalPlayers
  ) {
    state.status = "matched";
  } else if (hasBlockingVote) {
    state.status = "rejected";
  } else if (input.totalPlayers > 0 && state.totalVotes === input.totalPlayers) {
    state.status = "rejected";
  } else {
    state.status = "pending";
  }

  if (state.status === "pending") {
    state.resolvedAt = null;
    state.matchedAt = null;
  } else {
    state.resolvedAt = state.resolvedAt ?? input.votedAt;
    state.matchedAt =
      state.status === "matched" ? state.matchedAt ?? input.votedAt : null;
  }

  return {
    justMatched: previousStatus !== "matched" && state.status === "matched",
    state,
  };
};
