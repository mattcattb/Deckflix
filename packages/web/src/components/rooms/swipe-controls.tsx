import type { SwipeChoice } from "@deckflix/shared";

type SwipeControlsProps = {
  onSwipe: (choice: SwipeChoice) => void;
  disabled?: boolean;
  allowMaybe?: boolean;
  allowSuperLike?: boolean;
};

export function SwipeControls({
  onSwipe,
  disabled = false,
  allowMaybe = true,
  allowSuperLike = true,
}: SwipeControlsProps) {
  return (
    <div className="flex items-center justify-center gap-3">
      <button
        disabled={disabled}
        onClick={() => onSwipe("dislike")}
        className="flex h-14 w-14 items-center justify-center rounded-full border border-danger/30 bg-danger/10 text-danger transition-all hover:bg-danger/20 hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
        title="Dislike"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>

      {allowMaybe ? (
        <button
          disabled={disabled}
          onClick={() => onSwipe("maybe")}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-warning/30 bg-warning/10 text-warning transition-all hover:bg-warning/20 hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
          title="Maybe"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      ) : null}

      <button
        disabled={disabled}
        onClick={() => onSwipe("like")}
        className="flex h-14 w-14 items-center justify-center rounded-full border border-success/30 bg-success/10 text-success transition-all hover:bg-success/20 hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
        title="Like"
      >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>

      {allowSuperLike ? (
        <button
          disabled={disabled}
          onClick={() => onSwipe("super_like")}
          className="flex h-11 w-11 items-center justify-center rounded-full border border-primary/30 bg-primary/10 text-primary transition-all hover:bg-primary/20 hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
          title="Super Like"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="none">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      ) : null}

      <button
        disabled={disabled}
        onClick={() => onSwipe("skip")}
        className="flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.1] bg-white/[0.04] text-muted-foreground transition-all hover:bg-white/[0.08] hover:text-foreground hover:scale-110 disabled:opacity-40 disabled:hover:scale-100"
        title="Skip"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="13 17 18 12 13 7" />
          <polyline points="6 17 11 12 6 7" />
        </svg>
      </button>
    </div>
  );
}
