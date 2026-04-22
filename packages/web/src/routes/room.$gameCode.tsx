import {createFileRoute, redirect} from "@tanstack/react-router";
import {useQuery} from "@tanstack/react-query";
import type {RoomClient} from "@deckflix/shared/game-sessions";
import {api, parseRpc} from "../lib/api";
import {
  activeRoomClientQueryOptions,
  gameKeys,
} from "../lib/games";
import {
  DisplayRoomView,
  JoinRoomView,
  PlayerRoomView,
  RoomUnavailable,
} from "../features/room/room-views";

const normalizeGameCode = (gameCode: string) => gameCode.trim().toUpperCase();

const roomClientQueryOptions = (gameCode: string) => ({
  queryKey: gameKeys.roomClient(gameCode),
  queryFn: () =>
    parseRpc(
      api.api.rooms[":gameCode"].client.$get({
        param: {gameCode: normalizeGameCode(gameCode)},
      }),
    ),
});

export const Route = createFileRoute("/room/$gameCode")({
  beforeLoad: async ({context, params}) => {
    const activeSession = await context.queryClient.ensureQueryData(
      activeRoomClientQueryOptions,
    );

    if (
      activeSession.role !== "none" &&
      activeSession.gameCode !== normalizeGameCode(params.gameCode)
    ) {
      throw redirect({
        to: activeSession.role === "display" ? "/room" : "/play",
        replace: true,
      });
    }
  },
  loader: ({context, params}) =>
    context.queryClient.ensureQueryData(roomClientQueryOptions(params.gameCode)),
  component: RoomPage,
});

function RoomPage() {
  const {gameCode} = Route.useParams();

  const roomClientQuery = useQuery<RoomClient>(roomClientQueryOptions(gameCode));

  if (roomClientQuery.isLoading) {
    return null;
  }

  if (roomClientQuery.error || !roomClientQuery.data) {
    return (
      <RoomUnavailable
        message={
          roomClientQuery.error instanceof Error
            ? roomClientQuery.error.message
            : "This room is not available."
        }
      />
    );
  }

  if (roomClientQuery.data.role === "display") {
    return (
      <DisplayRoomView
        gameCode={gameCode}
        onSessionChange={() => void roomClientQuery.refetch()}
      />
    );
  }

  if (roomClientQuery.data.role === "player") {
    return (
      <PlayerRoomView
        gameCode={gameCode}
        onSessionChange={() => void roomClientQuery.refetch()}
      />
    );
  }

  return (
    <JoinRoomView
      gameCode={gameCode}
      onJoined={() => void roomClientQuery.refetch()}
    />
  );
}
