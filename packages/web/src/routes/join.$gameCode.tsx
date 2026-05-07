import {createFileRoute, redirect} from "@tanstack/react-router";
import {JoinRoomView} from "../features/room";
import {
  activeRoomClientQueryOptions,
  getActiveRoomPath,
  normalizeGameCode,
} from "../features/room/room-session";

export const Route = createFileRoute("/join/$gameCode")({
  beforeLoad: async ({context}) => {
    const activeClient = await context.queryClient.ensureQueryData(
      activeRoomClientQueryOptions,
    );

    if (activeClient.role !== "none") {
      throw redirect({
        to: getActiveRoomPath(activeClient),
        replace: true,
      });
    }
  },
  loader: async ({params}) => {
    const gameCode = normalizeGameCode(params.gameCode);
    return {gameCode};
  },
  component: JoinRoomPage,
});

function JoinRoomPage() {
  const {gameCode} = Route.useLoaderData();
  return <JoinRoomView gameCode={gameCode} />;
}
