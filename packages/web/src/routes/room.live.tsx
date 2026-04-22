import {createFileRoute} from "@tanstack/react-router";
import {DisplayRoomLiveView} from "../features/room";

export const Route = createFileRoute("/room/live")({
  component: DisplayRoomLiveView,
});
