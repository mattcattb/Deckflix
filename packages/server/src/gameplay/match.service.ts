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

  const positiveScore =
    state.likeCount + state.superLikeCount * 1.35 + state.maybeCount * 0.35;
  const supportRatio = positiveScore / Math.max(1, state.totalVotes);
  const enoughVotes =
    state.totalVotes >=
    (input.totalPlayers <= 2
      ? input.totalPlayers
      : Math.ceil(input.totalPlayers * 0.75));
  const acceptableOpposition =
    state.dislikeCount <= Math.floor(input.totalPlayers * 0.25);

  if (enoughVotes && supportRatio >= 0.7 && acceptableOpposition) {
    state.status = "matched";
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
