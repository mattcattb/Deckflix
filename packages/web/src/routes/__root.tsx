import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { useSession, signOut } from "../lib/auth";
import { Button } from "../components/ui";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  const { data: session, isPending } = useSession();

  return (
    <div className="min-h-screen">
      <header className="border-b border-border/60 bg-surface/70 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            matty-stack
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/rooms" className="text-muted-foreground hover:text-foreground">
              Rooms
            </Link>
            <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
              Dashboard
            </Link>
            {isPending ? null : session ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => signOut()}
              >
                Sign out
              </Button>
            ) : (
              <Link
                to="/login"
                className="rounded-full border border-border px-4 py-2 text-foreground transition hover:border-primary/60 hover:bg-primary/10"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-5xl px-4 py-10">
        <Outlet />
      </main>
    </div>
  );
}
