import {createFileRoute, Navigate} from "@tanstack/react-router";

export const Route = createFileRoute("/join")({
  component: JoinPage,
});

function JoinPage() {
  return <Navigate to="/" />;
}
