import {createFileRoute} from "@tanstack/react-router";
import {DisplayRoomLobbyView} from "../features/room";

export const Route = createFileRoute("/room/lobby")({
  component: DisplayRoomLobbyView,
});
