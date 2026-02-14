import type { CSSProperties } from "react";
import type { MovieCandidate, MovieVoteSummary } from "@matty-stack/shared";
import { cn } from "../../lib/cn";

type MovieCardProps = {
  movie: MovieCandidate;
  votes?: MovieVoteSummary;
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
        "overflow-hidden rounded-3xl border border-border/70 bg-surface shadow-[0_20px_40px_hsl(210_30%_20%/0.18)]",
        active ? "select-none touch-none" : "",
        className,
      )}
      style={style}
    >
      <div className="relative">
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="h-80 w-full object-cover"
          draggable={false}
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4">
          <div className="text-xl font-semibold text-white">
            {movie.title} ({movie.year})
          </div>
          <div className="text-sm text-white/80">Rating {movie.rating.toFixed(1)}</div>
        </div>
      </div>
      <div className="space-y-3 p-4">
        <p className="line-clamp-3 text-sm text-muted-foreground">{movie.overview}</p>
        {votes ? (
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
            <div>Like {votes.like}</div>
            <div>Dislike {votes.dislike}</div>
            <div>Super {votes.superLike}</div>
            <div>Maybe {votes.maybe}</div>
            <div>Skip {votes.skip}</div>
            <div>Total {votes.totalVotes}</div>
          </div>
        ) : null}
      </div>
    </article>
  );
}
