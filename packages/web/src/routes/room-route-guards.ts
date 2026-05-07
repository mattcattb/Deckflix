import type {ActiveRoomClient} from "@deckflix/shared";
import {redirect} from "@tanstack/react-router";

const noActiveRoomClient = {role: "none"} as const satisfies ActiveRoomClient;

const resolveActiveClient = (activeClient: ActiveRoomClient | undefined) =>
  activeClient ?? noActiveRoomClient;

export const requireNoActiveRoom = (activeClient: ActiveRoomClient | undefined) => {
  activeClient = resolveActiveClient(activeClient);

  if (activeClient.role === "display") {
    throw redirect({to: "/room", replace: true});
  }

  if (activeClient.role === "player") {
    throw redirect({to: "/play", replace: true});
  }

  return activeClient;
};

export const requireDisplayRoom = (activeClient: ActiveRoomClient | undefined) => {
  activeClient = resolveActiveClient(activeClient);

  if (activeClient.role === "none") {
    throw redirect({to: "/", replace: true});
  }

  if (activeClient.role === "player") {
    throw redirect({to: "/play", replace: true});
  }

  return activeClient;
};

export const requirePlayerRoom = (activeClient: ActiveRoomClient | undefined) => {
  activeClient = resolveActiveClient(activeClient);

  if (activeClient.role === "none") {
    throw redirect({to: "/", replace: true});
  }

  if (activeClient.role === "display") {
    throw redirect({to: "/room", replace: true});
  }

  return activeClient;
};
