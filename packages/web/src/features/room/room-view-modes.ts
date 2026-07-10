import type {GameStatus} from "@deckflix/shared";

export type DisplayRoomViewMode = "lobby" | "playing" | "completed";
export type PlayerRoomViewMode = "waiting" | "swiping" | "finale" | "completed";
export type DisplayRoomPath = "/room/lobby" | "/room/live" | "/room/results";

export const getDisplayRoomViewMode = (
  status: GameStatus,
): DisplayRoomViewMode => {
  if (status === "swiping" || status === "finale") {
    return "playing";
  }

  return status;
};

export const getDisplayRoomPath = (status: GameStatus): DisplayRoomPath => {
  if (status === "lobby") {
    return "/room/lobby";
  }

  if (status === "completed") {
    return "/room/results";
  }

  return "/room/live";
};

export const getPlayerRoomViewMode = (
  status: GameStatus,
): PlayerRoomViewMode => {
  if (status === "lobby") {
    return "waiting";
  }

  if (status === "completed") {
    return "completed";
  }

  return "swiping";
};
