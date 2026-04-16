import type { SwipeChoice } from "@deckflix/shared";
import { Button } from "../ui";

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
    <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
      <Button disabled={disabled} onClick={() => onSwipe("like")}>
        Like
      </Button>
      <Button disabled={disabled} onClick={() => onSwipe("dislike")} variant="outline">
        Dislike
      </Button>
      {allowMaybe ? (
        <Button disabled={disabled} onClick={() => onSwipe("maybe")} variant="secondary">
          Maybe
        </Button>
      ) : (
        <Button disabled variant="secondary">
          Maybe Off
        </Button>
      )}
      {allowSuperLike ? (
        <Button disabled={disabled} onClick={() => onSwipe("super_like")}>
          Super
        </Button>
      ) : (
        <Button disabled>Super Off</Button>
      )}
      <Button disabled={disabled} onClick={() => onSwipe("skip")} variant="ghost">
        Skip
      </Button>
    </div>
  );
}
