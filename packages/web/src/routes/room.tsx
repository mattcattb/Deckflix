import {useEffect} from "react";
import {createFileRoute, useNavigate} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import type {ActiveRoomClient} from "@deckflix/shared/game-sessions";
import {gameKeys, getActiveRoomClient} from "../lib/games";
import {DisplayRoomView} from "./room.$gameCode";

export const Route = createFileRoute("/room")({
  component: ActiveRoomPage,
});

function ActiveRoomPage() {
  const navigate = useNavigate();
  const activeSessionQuery = useQuery<ActiveRoomClient>({
    queryKey: gameKeys.activeClient,
    queryFn: getActiveRoomClient,
  });

  useEffect(() => {
    if (!activeSessionQuery.data) {
      return;
    }

    if (activeSessionQuery.data.role === "none") {
      navigate({
        to: "/",
        replace: true,
      });
      return;
    }

    if (activeSessionQuery.data.role === "player") {
      navigate({
        to: "/play",
        replace: true,
      });
    }
  }, [activeSessionQuery.data, navigate]);

  if (
    activeSessionQuery.isLoading ||
    !activeSessionQuery.data ||
    activeSessionQuery.data.role !== "display"
  ) {
    return null;
  }

  return (
    <DisplayRoomView
      gameCode={activeSessionQuery.data.gameCode}
      onSessionChange={() => void activeSessionQuery.refetch()}
      scopedToActiveRoom
    />
  );
}
