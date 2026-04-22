import {createFileRoute} from "@tanstack/react-router";
import {DisplayRoomResultsView} from "../features/room";

export const Route = createFileRoute("/room/results")({
  component: DisplayRoomResultsView,
});
