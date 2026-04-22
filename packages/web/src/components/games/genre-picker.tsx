import {useState} from "react";
import {Popover} from "@base-ui/react/popover";
import {Checkbox} from "../ui";
import {cn} from "../../lib/cn";

type MovieGenre = {
  id: number;
  name: string;
};

export type GenrePickerProps = {
  label: string;
  genres: MovieGenre[];
  selectedGenreIds: number[];
  onToggle: (genreId: number, checked: boolean) => void;
  onClear: () => void;
  tone?: "include" | "exclude";
  emptyLabel?: string;
};

export function GenrePicker({
  label,
  genres,
  selectedGenreIds,
  onToggle,
  onClear,
  tone = "include",
  emptyLabel = "None",
}: GenrePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = genres.filter((g) => selectedGenreIds.includes(g.id));
  const badgeClass =
    tone === "include"
      ? "bg-primary/15 text-primary border-primary/30"
      : "bg-danger/15 text-danger border-danger/30";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        {selected.length > 0 ? (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground transition"
            onClick={onClear}>
            Clear
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {selected.length === 0 ? (
          <span className="text-xs text-muted-foreground italic">
            {emptyLabel}
          </span>
        ) : (
          selected.map((genre) => (
            <button
              key={genre.id}
              type="button"
              onClick={() => onToggle(genre.id, false)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition hover:brightness-110",
                badgeClass,
              )}>
              {genre.name}
              <span className="opacity-60">×</span>
            </button>
          ))
        )}

        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger
            render={
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.04] text-muted-foreground hover:text-foreground hover:border-white/[0.24] transition"
                aria-label={`Add ${label.toLowerCase()}`}>
                +
              </button>
            }
          />
          <Popover.Portal>
            <Popover.Positioner sideOffset={6} align="start">
              <Popover.Popup className="z-50 w-64 max-h-72 overflow-y-auto rounded-xl border border-white/[0.08] bg-surface/95 backdrop-blur p-2 shadow-xl outline-none">
                <div className="grid grid-cols-1 gap-0.5">
                  {genres.map((genre) => (
                    <div
                      key={genre.id}
                      className="rounded-md px-2 py-1.5 hover:bg-white/[0.06]">
                      <Checkbox
                        checked={selectedGenreIds.includes(genre.id)}
                        onCheckedChange={(checked) =>
                          onToggle(genre.id, checked === true)
                        }
                        label={genre.name}
                      />
                    </div>
                  ))}
                </div>
              </Popover.Popup>
            </Popover.Positioner>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}
