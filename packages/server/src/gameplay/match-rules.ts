import type {SwipeChoice} from "@deckflix/shared";
import type {MovieState} from "../recommendations/recommendations.service";

export const applyVoteToMovieState = (input: {
  state: MovieState;
  choice: SwipeChoice;
  totalPlayers: number;
  votedAt: string;
}) => {
  const previousStatus = input.state.status;
  const state: MovieState = {
    ...input.state,
    totalVotes: input.state.totalVotes + 1,
    lastActivityAt: input.votedAt,
    resolvedAt: input.state.resolvedAt ?? null,
    matchedAt: input.state.matchedAt ?? null,
  };

  switch (input.choice) {
    case "like":
      state.likeCount += 1;
      break;
    case "dislike":
      state.dislikeCount += 1;
      break;
    case "maybe":
      state.maybeCount += 1;
      break;
    case "super_like":
      state.superLikeCount += 1;
      break;
    case "skip":
      state.skipCount += 1;
      break;
  }

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
