import {subscribeAppEvents, type AppEvent} from "../common/app-events";
import {createChildLogger} from "../common/logger";
import * as VoteService from "./vote.service";

const logger = createChildLogger({service: "game.event.listener"});
let subscribed = false;

const handleGameEvent = (event: AppEvent) => {
  if (event.type !== "game.vote_recorded") {
    return;
  }

  void VoteService.resolveVoteResult({
    gameCode: event.gameCode,
    movieId: event.movieId,
    votedAt: event.votedAt,
  }).catch((error) => {
    logger.error(
      {error, gameCode: event.gameCode, movieId: event.movieId},
      "Failed to resolve vote result",
    );
  });
};

export const ensureGameEventListener = () => {
  if (subscribed) {
    return;
  }

  subscribeAppEvents(handleGameEvent);
  subscribed = true;
};
