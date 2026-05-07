import {createFileRoute} from "@tanstack/react-router";
import {DisplayBrowseView} from "../features/display/DisplayBrowseView";
import {useDisplayRoom} from "../features/display/DisplayRoomView";

export const Route = createFileRoute("/room/live")({
  component: DisplayRoomLiveView,
});

function DisplayRoomLiveView() {
  const {board} = useDisplayRoom();
  return <DisplayBrowseView board={board} mode="live" />;
}
