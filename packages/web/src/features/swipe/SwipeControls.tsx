import type {SwipeChoice} from "@deckflix/shared";

type SwipeControlsProps = {
  onSwipe: (choice: SwipeChoice) => void;
  disabled?: boolean;
};

export function SwipeControls({
  onSwipe,
  disabled = false,
}: SwipeControlsProps) {
  return (
    <div className="flex items-center justify-center gap-5 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <button
        disabled={disabled}
        onClick={() => onSwipe("dislike")}
        aria-label="Pass on this movie"
        className="flex h-16 w-16 touch-manipulation items-center justify-center rounded-full border border-danger/30 bg-danger/10 text-danger transition-transform hover:bg-danger/20 active:scale-95 disabled:opacity-40"
        title="Dislike">
        <svg
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
        disabled={disabled}
        onClick={() => onSwipe("like")}
        aria-label="Like this movie"
        className="flex h-16 w-16 touch-manipulation items-center justify-center rounded-full border border-success/30 bg-success/10 text-success transition-transform hover:bg-success/20 active:scale-95 disabled:opacity-40"
        title="Like">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="currentColor"
          stroke="none">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
    </div>
  );
}
