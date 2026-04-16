import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "../components/ui";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-5 py-16">
      <div className="enter-rise flex flex-col items-center text-center">
        <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="hsl(350 85% 56%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" />
            <line x1="7" y1="2" x2="7" y2="22" />
            <line x1="17" y1="2" x2="17" y2="22" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <line x1="2" y1="7" x2="7" y2="7" />
            <line x1="2" y1="17" x2="7" y2="17" />
            <line x1="17" y1="7" x2="22" y2="7" />
            <line x1="17" y1="17" x2="22" y2="17" />
          </svg>
        </div>
        <h1 className="text-5xl font-bold tracking-tight md:text-7xl">
          Deck<span className="text-primary">flix</span>
        </h1>
        <p className="mt-3 max-w-md text-lg text-muted-foreground">
          Swipe on movies together. Find what everyone wants to watch.
        </p>
      </div>

      <div className="enter-rise enter-delay-1 mt-12 flex flex-col items-center gap-4 sm:flex-row">
        <Link to="/rooms">
          <Button size="lg" effect="glow" className="min-w-[200px] text-base">
            Start a room
          </Button>
        </Link>
        <Link to="/rooms">
          <Button variant="outline" size="lg" className="min-w-[200px] text-base">
            Join a room
          </Button>
        </Link>
      </div>

      <div className="enter-rise enter-delay-2 mt-16 grid max-w-lg grid-cols-3 gap-8 text-center">
        <div>
          <div className="text-2xl font-bold text-primary">1</div>
          <p className="mt-1 text-sm text-muted-foreground">Create a room</p>
        </div>
        <div>
          <div className="text-2xl font-bold text-primary">2</div>
          <p className="mt-1 text-sm text-muted-foreground">Friends join with code</p>
        </div>
        <div>
          <div className="text-2xl font-bold text-primary">3</div>
          <p className="mt-1 text-sm text-muted-foreground">Swipe to a match</p>
        </div>
      </div>
    </div>
  );
}
