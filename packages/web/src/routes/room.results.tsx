import {createFileRoute} from "@tanstack/react-router";
import {DisplayBrowseView} from "../features/display/DisplayBrowseView";
import {useDisplayRoom} from "../features/display/DisplayRoomView";

export const Route = createFileRoute("/room/results")({
  component: DisplayRoomResultsView,
});

function DisplayRoomResultsView() {
  const {board} = useDisplayRoom();
  return <DisplayBrowseView board={board} mode="results" />;
}
