import { createFileRoute, Link } from "@tanstack/react-router";
import { Button, Card, CardContent } from "../components/ui";
import { useSession } from "../lib/auth";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { data: session, isPending } = useSession();

  return (
    <div className="space-y-10">
      <section className="grid gap-6 lg:grid-cols-[1.3fr_1fr] lg:items-center">
        <div className="space-y-4">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            deckflix mvp
          </p>
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
            Spin up anonymous movie rooms and swipe to a group pick.
          </h1>
          <p className="text-base text-muted-foreground md:text-lg">
            The MVP is room-first: anonymous joins, Redis-backed room state,
            HTTP writes, and websocket room updates.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link to="/rooms">
              <Button effect="glow">Open movie rooms</Button>
            </Link>
            {isPending ? null : session ? (
              <Link to="/dashboard">
                <Button variant="outline">Go to dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="outline">Optional sign in</Button>
                </Link>
              </>
            )}
          </div>
        </div>
        <Card className="enter-rise">
          <CardContent className="space-y-4 p-6">
            <div className="text-sm text-muted-foreground">Stack overview</div>
            <ul className="space-y-2 text-sm">
              <li>Server: Bun + Hono</li>
              <li>Room state: Redis</li>
              <li>Database: Postgres + Drizzle ORM</li>
              <li>Auth: optional, later-facing</li>
              <li>Web: React + TanStack Router + Tailwind</li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
