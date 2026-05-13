import {useEffect, useMemo, useRef, useState} from "react";
import type {GameActivityItem, MovieCandidate} from "@deckflix/shared";
import {MovieDetailsOverlay} from "../movie-catalog/components/movie-details-overlay";

type DisplayRailProps = {
  title: string;
  items: GameActivityItem[];
  tone: "match" | "mixed" | "stinker";
  interactive?: boolean;
  watchRegion?: string;
};

export function DisplayRail({
  title,
  items,
  tone,
  interactive = true,
  watchRegion = "US",
}: DisplayRailProps) {
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [newCardIds, setNewCardIds] = useState<string[]>([]);
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);
  const movieById = useMemo(
    () => new Map(items.map((item) => [item.movie.id, item.movie] as const)),
    [items],
  );
  const selectedMovie = selectedMovieId
    ? movieById.get(selectedMovieId) ?? null
    : null;

  useEffect(() => {
    const ids = items.map((item) => item.movie.id);
    if (seenIdsRef.current.size === 0) {
      ids.forEach((id) => seenIdsRef.current.add(id));
      return;
    }

    const nextNewIds = ids.filter((id) => !seenIdsRef.current.has(id));
    ids.forEach((id) => seenIdsRef.current.add(id));
    if (nextNewIds.length === 0) {
      return;
    }

    setNewCardIds(nextNewIds);
    const timeout = window.setTimeout(() => setNewCardIds([]), 700);
    return () => window.clearTimeout(timeout);
  }, [items]);

  if (items.length === 0) {
    return null;
  }

  return (
    <section className="space-y-4">
      <MovieDetailsOverlay
        movie={selectedMovie}
        movieId={selectedMovieId}
        watchRegion={watchRegion}
        onClose={() => setSelectedMovieId(null)}
      />

      <h2 className="text-2xl font-medium font-display text-white">{title}</h2>
      <div className="flex gap-4 overflow-x-auto pb-2">
        {items.map((item) => (
          <DisplayRailCard
            key={`${title}-${item.movie.id}`}
            item={item}
            isNew={newCardIds.includes(item.movie.id)}
            tone={tone}
            interactive={interactive}
            onSelect={() => setSelectedMovieId(item.movie.id)}
          />
        ))}
      </div>
    </section>
  );
}

export function MatchFoundOverlay({movie}: {movie: MovieCandidate}) {
  return (
    <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-black/78 backdrop-blur-md">
      <div className="match-overlay-glow absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(357_92%_47%_/_0.4),_transparent_38%),radial-gradient(circle_at_bottom,_hsl(145_65%_42%_/_0.24),_transparent_32%)]" />
      <div className="match-overlay-card relative mx-6 flex w-full max-w-4xl items-center gap-6 rounded-[2rem] border border-white/10 bg-white/[0.06] p-6 shadow-[0_30px_120px_rgba(0,0,0,0.5)]">
        <img
          src={movie.posterUrl}
          alt={movie.title}
          className="match-overlay-poster h-72 w-48 shrink-0 rounded-[1.5rem] object-cover shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
        />
        <div className="max-w-xl">
          <div className="match-overlay-badge inline-flex items-center rounded-full border border-swipe-like/35 bg-swipe-like/12 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.32em] text-swipe-like">
            It&apos;s a match
          </div>
          <h2 className="match-overlay-title mt-5 text-5xl font-semibold leading-none text-white text-balance font-display">
            {movie.title}
          </h2>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/74">
            <span>{movie.year}</span>
            <span className="text-white/20">&bull;</span>
            <span>{movie.rating.toFixed(1)} TMDB</span>
          </div>
          <p className="mt-5 max-w-lg text-sm leading-6 text-white/68">
            Everyone swiped right. Queue this one up.
          </p>
        </div>
      </div>
    </div>
  );
}

function DisplayRailCard({
  item,
  isNew,
  tone,
  interactive,
  onSelect,
}: {
  item: GameActivityItem;
  isNew: boolean;
  tone: "match" | "mixed" | "stinker";
  interactive: boolean;
  onSelect: () => void;
}) {
  const cardTone =
    item.outcome === "match"
      ? "match"
      : item.outcome === "rejected"
        ? "stinker"
        : "active";
  const positiveVotes = item.votes.like + item.votes.superLike;
  const negativeVotes = item.votes.dislike + item.votes.skip + item.votes.maybe;
  const accentTone = tone === "mixed" ? cardTone : tone;
  const frameClass =
    accentTone === "match"
      ? "ring-1 ring-swipe-like/35"
      : accentTone === "stinker"
        ? "ring-1 ring-danger/35"
        : "ring-1 ring-white/20";
  const badgeClass =
    accentTone === "match"
      ? "border-swipe-like/35 bg-swipe-like/15 text-swipe-like"
      : accentTone === "stinker"
        ? "border-danger/35 bg-danger/15 text-danger"
        : "border-white/20 bg-black/45 text-white";
  const voteCount =
    item.outcome === "match"
      ? positiveVotes
      : item.outcome === "rejected"
        ? negativeVotes
        : item.votes.totalVotes;
  const badgeText =
    item.outcome === "active"
      ? `${item.votes.totalVotes} swipe${item.votes.totalVotes === 1 ? "" : "s"}`
      : interactive
        ? "Click for details"
        : item.outcome === "match"
          ? "Match"
          : "Rejected";

  const content = (
    <>
      <img
        src={item.movie.posterUrl}
        alt={item.movie.title}
        className="h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/82 via-black/18 to-transparent" />
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-2 px-3 pt-3">
        <div className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-semibold ${badgeClass}`}>
          {item.outcome === "match" ? (
            <HeartIcon size={12} />
          ) : item.outcome === "rejected" ? (
            <XIcon size={12} />
          ) : (
            <ActivityIcon size={12} />
          )}
          <span>{voteCount}</span>
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 px-4 pb-4">
        <div className="line-clamp-2 text-xl font-medium leading-tight font-display text-white">
          {item.movie.title}
        </div>
        <div className="mt-2 text-[11px] uppercase tracking-[0.24em] text-white/55">
          {badgeText}
        </div>
      </div>
    </>
  );

  if (!interactive) {
    return (
      <div
        className={`relative h-56 w-[14rem] shrink-0 overflow-hidden rounded-md bg-[#181818] ${frameClass} ${
          isNew ? "rail-card-enter" : ""
        }`}>
        {content}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group relative h-56 w-[14rem] shrink-0 overflow-hidden rounded-md bg-[#181818] transition-transform duration-200 hover:scale-[1.02] ${frameClass} ${
        isNew ? "rail-card-enter" : ""
      }`}>
      {content}
    </button>
  );
}

function HeartIcon({size = 14}: {size?: number}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="currentColor"
      stroke="none">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

function XIcon({size = 14}: {size?: number}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function ActivityIcon({size = 14}: {size?: number}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round">
      <path d="M3 12h4l2.5-5 4 10 2.5-5H21" />
    </svg>
  );
}
