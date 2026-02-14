import { useMemo, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { RoomDeckItem, SwipeChoice } from "@matty-stack/shared";
import { MovieCard } from "./movie-card";

type SwipeDeckProps = {
  items: RoomDeckItem[];
  currentIndex: number;
  onSwipe: (choice: SwipeChoice, movieId: string) => void;
  disabled?: boolean;
};

const SWIPE_THRESHOLD_PX = 120;

export function SwipeDeck({
  items,
  currentIndex,
  onSwipe,
  disabled = false,
}: SwipeDeckProps) {
  const activeItem = items[currentIndex] ?? null;
  const nextItem = items[currentIndex + 1] ?? null;

  const [dragX, setDragX] = useState(0);
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  const rotate = useMemo(() => Math.max(-10, Math.min(10, dragX / 14)), [dragX]);
  const swipeHint = useMemo(() => {
    if (dragX > 24) return "LIKE";
    if (dragX < -24) return "NOPE";
    return null;
  }, [dragX]);

  const resetDrag = () => {
    setIsDragging(false);
    setDragX(0);
    setDragY(0);
    startRef.current = null;
  };

  const commitSwipe = (direction: "left" | "right") => {
    if (!activeItem) return;
    onSwipe(direction === "right" ? "like" : "dislike", activeItem.movie.id);
    resetDrag();
  };

  const onPointerDown = (event: ReactPointerEvent) => {
    if (disabled || !activeItem) return;
    startRef.current = { x: event.clientX, y: event.clientY };
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: ReactPointerEvent) => {
    if (!isDragging || !startRef.current) return;
    setDragX(event.clientX - startRef.current.x);
    setDragY(event.clientY - startRef.current.y);
  };

  const onPointerUp = () => {
    if (!isDragging) return;
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

  if (!activeItem) {
    return (
      <div className="rounded-3xl border border-border/70 bg-surface p-6 text-sm text-muted-foreground">
        No remaining movies in this deck.
      </div>
    );
  }

  return (
    <div className="relative mx-auto w-full max-w-md">
      {nextItem ? (
        <MovieCard
          movie={nextItem.movie}
          votes={nextItem.votes}
          className="absolute inset-0 translate-y-3 scale-[0.96] opacity-70"
        />
      ) : null}
      <div
        className="relative"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={resetDrag}
      >
        <MovieCard
          movie={activeItem.movie}
          votes={activeItem.votes}
          active
          className="relative z-10 transition-transform duration-150"
          style={{
            transform: `translate(${dragX}px, ${dragY * 0.25}px) rotate(${rotate}deg)`,
          }}
        />
        {swipeHint ? (
          <div className="pointer-events-none absolute left-4 top-4 z-20 rounded-md border border-white/70 bg-black/40 px-3 py-1 text-xs font-semibold tracking-[0.2em] text-white">
            {swipeHint}
          </div>
        ) : null}
      </div>
    </div>
  );
}
