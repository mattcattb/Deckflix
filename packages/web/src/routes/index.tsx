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
            matty-stack starter
          </p>
          <h1 className="text-4xl font-semibold leading-tight md:text-5xl">
            Launch with Better Auth, Drizzle, and a clean, reusable web +
            server setup.
          </h1>
          <p className="text-base text-muted-foreground md:text-lg">
            This boilerplate keeps the essentials: Bun + Hono API, Drizzle
            schema, Better Auth with the Drizzle adapter, and a lightweight
            React app.
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
                <Link to="/signup">
                  <Button effect="glow">Create account</Button>
                </Link>
                <Link to="/login">
                  <Button variant="outline">Sign in</Button>
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
              <li>Database: Postgres + Drizzle ORM</li>
              <li>Auth: Better Auth + Drizzle adapter</li>
              <li>Web: React + TanStack Router + Tailwind</li>
            </ul>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
