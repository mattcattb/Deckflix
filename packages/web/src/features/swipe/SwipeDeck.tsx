import {useEffect, useMemo, useRef, useState} from "react";
import type {PointerEvent as ReactPointerEvent} from "react";
import type {ActiveGameQueueItem, SwipeChoice} from "@deckflix/shared";
import {MovieCard} from "../movie-catalog/components/movie-card";
import {MovieDetailsOverlay} from "../movie-catalog/components/movie-details-overlay";

type SwipeDeckProps = {
  item: ActiveGameQueueItem | null;
  onSwipe: (choice: SwipeChoice, movieId: string) => void;
  disabled?: boolean;
  watchRegion?: string;
};

const SWIPE_THRESHOLD_PX = 120;
const SWIPE_EXIT_DURATION_MS = 220;

export function SwipeDeck({
  item,
  onSwipe,
  disabled = false,
  watchRegion = "US",
}: SwipeDeckProps) {
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isEntering, setIsEntering] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  const [displayedItem, setDisplayedItem] = useState(item);
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);
  const startRef = useRef<{x: number; y: number} | null>(null);
  const swipeTimerRef = useRef<number | null>(null);

  const rotate = useMemo(() => Math.max(-12, Math.min(12, dragX / 14)), [dragX]);
  const swipeHint = useMemo(() => {
    if (dragX > 24) return "LIKE";
    if (dragX < -24) return "NOPE";
    return null;
  }, [dragX]);

  const interactionLocked = disabled || isEntering || isExiting;

  useEffect(
    () => () => {
      if (swipeTimerRef.current !== null) {
        window.clearTimeout(swipeTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (item?.movie.id === displayedItem?.movie.id) {
      if (!disabled && isExiting) {
        setIsExiting(false);
        setDragX(0);
        setDragY(0);
      }
      return;
    }

    setDisplayedItem(item);
    setSelectedMovieId(null);
    setIsDragging(false);
    setIsExiting(false);
    setIsEntering(Boolean(item));
    setDragX(0);
    setDragY(0);
    startRef.current = null;

    if (!item) {
      return;
    }

    const frame = window.requestAnimationFrame(() => setIsEntering(false));
    return () => window.cancelAnimationFrame(frame);
  }, [disabled, item, item?.movie.id]);

  const resetDrag = () => {
    setIsDragging(false);
    setDragX(0);
    setDragY(0);
    startRef.current = null;
  };

  const commitSwipe = (choice: SwipeChoice) => {
    if (!displayedItem || interactionLocked) {
      return;
    }

    const direction = choice === "like" || choice === "super_like" ? 1 : -1;
    setIsDragging(false);
    setIsExiting(true);
    setDragX(direction * Math.max(window.innerWidth * 0.85, 520));
    setDragY(-24);
    startRef.current = null;
    const movieId = displayedItem.movie.id;
    swipeTimerRef.current = window.setTimeout(() => {
      swipeTimerRef.current = null;
      onSwipe(choice, movieId);
    }, SWIPE_EXIT_DURATION_MS);
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (interactionLocked || !displayedItem) {
      return;
    }

    startRef.current = {x: event.clientX, y: event.clientY};
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!isDragging || !startRef.current) {
      return;
    }

    setDragX(event.clientX - startRef.current.x);
    setDragY(event.clientY - startRef.current.y);
  };

  const onPointerUp = () => {
    if (!isDragging) {
      return;
    }

    if (dragX > SWIPE_THRESHOLD_PX) {
      commitSwipe("like");
      return;
    }

    if (dragX < -SWIPE_THRESHOLD_PX) {
      commitSwipe("dislike");
      return;
    }

    resetDrag();
  };

  if (!displayedItem) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] text-sm text-muted-foreground">
        No remaining movies in this queue.
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full">
      <MovieDetailsOverlay
        movie={selectedMovieId ? displayedItem.movie : null}
        movieId={selectedMovieId}
        watchRegion={watchRegion}
        onClose={() => setSelectedMovieId(null)}
      />
      <div
        className="relative"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={resetDrag}>
        <MovieCard
          key={displayedItem.movie.id}
          movie={displayedItem.movie}
          active
          className="relative z-10"
          style={{
            opacity: isExiting || isEntering ? 0 : 1,
            transform: isEntering
              ? "translate3d(0, 14px, 0) scale(0.985)"
              : `translate3d(${dragX}px, ${dragY * 0.2}px, 0) rotate(${rotate}deg)`,
            transition: isDragging
              ? "none"
              : "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out",
            willChange:
              isDragging || isEntering || isExiting
                ? "transform, opacity"
                : undefined,
          }}
          onDetailsClick={() => setSelectedMovieId(displayedItem.movie.id)}
        />
        {swipeHint ? (
          <div
            className={`pointer-events-none absolute top-6 z-20 rounded-xl border-2 px-4 py-2 text-sm font-bold tracking-[0.15em] ${
              swipeHint === "LIKE"
                ? "left-6 border-success text-success rotate-[-12deg]"
                : "right-6 border-danger text-danger rotate-[12deg]"
            }`}>
            {swipeHint}
          </div>
        ) : null}
      </div>
      <div className="mt-4 flex items-center justify-center gap-5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          disabled={interactionLocked}
          onClick={() => commitSwipe("dislike")}
          aria-label="Pass on this movie"
          className="flex h-16 w-16 touch-manipulation items-center justify-center rounded-full border border-danger/35 bg-danger/10 text-danger shadow-[0_10px_30px_hsl(0_0%_0%/0.35)] transition-[transform,background-color,opacity] duration-150 hover:bg-danger/20 active:scale-90 disabled:opacity-35">
          <svg
            aria-hidden="true"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>

        <button
          type="button"
          disabled={interactionLocked}
          onClick={() => commitSwipe("like")}
          aria-label="Like this movie"
          className="flex h-16 w-16 touch-manipulation items-center justify-center rounded-full border border-success/35 bg-success/10 text-success shadow-[0_10px_30px_hsl(0_0%_0%/0.35)] transition-[transform,background-color,opacity] duration-150 hover:bg-success/20 active:scale-90 disabled:opacity-35">
          <svg
            aria-hidden="true"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="currentColor">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
          </svg>
        </button>
      </div>
    </div>
  );
}
