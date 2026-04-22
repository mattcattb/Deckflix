import {Outlet, createFileRoute, redirect} from "@tanstack/react-router";

export const Route = createFileRoute("/join")({
  beforeLoad: ({location}) => {
    if (location.pathname === "/join") {
      throw redirect({to: "/", replace: true});
    }
  },
  component: JoinLayout,
});

function JoinLayout() {
  return <Outlet />;
}
