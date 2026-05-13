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

export function SwipeDeck({
  item,
  onSwipe,
  disabled = false,
  watchRegion = "US",
}: SwipeDeckProps) {
  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [selectedMovieId, setSelectedMovieId] = useState<string | null>(null);
  const startRef = useRef<{x: number; y: number} | null>(null);

  const rotate = useMemo(() => Math.max(-10, Math.min(10, dragX / 14)), [dragX]);
  const swipeHint = useMemo(() => {
    if (dragX > 24) return "LIKE";
    if (dragX < -24) return "NOPE";
    return null;
  }, [dragX]);

  useEffect(() => {
    setSelectedMovieId(null);
  }, [item?.movie.id]);

  const resetDrag = () => {
    setIsDragging(false);
    setDragX(0);
    setDragY(0);
    startRef.current = null;
  };

  const commitSwipe = (direction: "left" | "right") => {
    if (!item) {
      return;
    }

    onSwipe(direction === "right" ? "like" : "dislike", item.movie.id);
    resetDrag();
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (disabled || !item) {
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
      commitSwipe("right");
      return;
    }

    if (dragX < -SWIPE_THRESHOLD_PX) {
      commitSwipe("left");
      return;
    }

    resetDrag();
  };

  if (!item) {
    return (
      <div className="flex h-[300px] items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] text-sm text-muted-foreground">
        No remaining movies in this queue.
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full">
      <MovieDetailsOverlay
        movie={selectedMovieId ? item.movie : null}
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
          movie={item.movie}
          active
          className="relative z-10 transition-transform duration-150"
          style={{
            transform: `translate(${dragX}px, ${dragY * 0.25}px) rotate(${rotate}deg)`,
          }}
          onDetailsClick={() => setSelectedMovieId(item.movie.id)}
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
    </div>
  );
}
