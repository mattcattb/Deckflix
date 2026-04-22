import {createFileRoute, redirect} from "@tanstack/react-router";
import {JoinRoomView} from "../features/room";
import {
  activeRoomClientQueryOptions,
  getActiveRoomPath,
  normalizeGameCode,
  roomMetaQueryOptions,
  roomPlayersQueryOptions,
} from "../lib/games";

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
  loader: async ({context, params}) => {
    const gameCode = normalizeGameCode(params.gameCode);

    await Promise.all([
      context.queryClient.prefetchQuery(roomMetaQueryOptions(gameCode)),
      context.queryClient.prefetchQuery(roomPlayersQueryOptions(gameCode)),
    ]);

    return {gameCode};
  },
  component: JoinRoomPage,
});

function JoinRoomPage() {
  const {gameCode} = Route.useLoaderData();
  return <JoinRoomView gameCode={gameCode} />;
}
