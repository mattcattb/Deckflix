import type { CSSProperties } from "react";
import type { GameVoteSummary, MovieCandidate } from "@deckflix/shared";
import { cn } from "../../lib/cn";

type MovieCardProps = {
  movie: MovieCandidate;
  votes?: GameVoteSummary;
  className?: string;
  active?: boolean;
  style?: CSSProperties;
};

export function MovieCard({
  movie,
  votes,
  className,
  active = false,
  style,
}: MovieCardProps) {
  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] shadow-[0_20px_60px_hsl(0_0%_0%/0.5)]",
        active ? "select-none touch-none" : "",
        className,
      )}
      style={style}
    >
      <div className="relative">
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="h-[400px] w-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-5 pb-5 pt-16">
          <div className="text-2xl font-bold text-white font-display leading-tight">
            {movie.title}
          </div>
          <div className="mt-1 flex items-center gap-2 text-sm text-white/70">
            <span>{movie.year}</span>
            <span className="text-white/30">&bull;</span>
            <span className="flex items-center gap-1">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="text-warning">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
              {movie.rating.toFixed(1)}
            </span>
          </div>
        </div>
      </div>
      <div className="space-y-3 px-5 py-4">
        <p className="line-clamp-2 text-sm leading-relaxed text-muted-foreground">{movie.overview}</p>
        {votes ? (
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-success/15 px-2.5 py-0.5 text-success">
              {votes.like} likes
            </span>
            <span className="rounded-full bg-danger/15 px-2.5 py-0.5 text-danger">
              {votes.dislike} nope
            </span>
            {votes.superLike > 0 ? (
              <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-primary">
                {votes.superLike} super
              </span>
            ) : null}
            {votes.maybe > 0 ? (
              <span className="rounded-full bg-warning/15 px-2.5 py-0.5 text-warning">
                {votes.maybe} maybe
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
