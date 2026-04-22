import type {GameStatus} from "@deckflix/shared";

export type DisplayRoomViewMode = "lobby" | "playing" | "completed";
export type PlayerRoomViewMode = "waiting" | "swiping" | "completed";

export const getDisplayRoomViewMode = (
  status: GameStatus,
): DisplayRoomViewMode => {
  if (status === "swiping") {
    return "playing";
  }

  return status;
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
