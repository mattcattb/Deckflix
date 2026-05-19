type PoolExpansionRequestedEvent = {
  type: "pool.expansion_requested";
  gameCode: string;
  reason: "swipe_recorded" | "player_state_requested";
};

type PoolEvent = PoolExpansionRequestedEvent;
type PoolEventListener = (event: PoolEvent) => void;

const listeners = new Set<PoolEventListener>();

export const subscribePoolEvents = (listener: PoolEventListener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const requestPoolExpansion = (
  input: Omit<PoolExpansionRequestedEvent, "type">,
) => {
  const event: PoolExpansionRequestedEvent = {
    type: "pool.expansion_requested",
    ...input,
  };

  for (const listener of listeners) {
    listener(event);
  }
};

export type {PoolEvent};
