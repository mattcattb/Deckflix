import {subscribePoolEvents, type PoolEvent} from "./pool-events";
import * as PoolExpansionService from "./pool-expansion.service";

let subscribed = false;

const handlePoolEvent = (event: PoolEvent) => {
  if (event.type !== "pool.expansion_requested") {
    return;
  }

  void PoolExpansionService.ensurePoolHasBuffer({
    gameCode: event.gameCode,
    reason: event.reason,
  });
};

export const ensurePoolEventListener = () => {
  if (subscribed) {
    return;
  }

  subscribePoolEvents(handlePoolEvent);
  subscribed = true;
};
