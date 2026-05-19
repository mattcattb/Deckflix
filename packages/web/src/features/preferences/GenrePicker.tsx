import {useState, type ReactNode} from "react";
import * as Popover from "@radix-ui/react-popover";
import type {MovieWatchProvider} from "@deckflix/shared";
import {Checkbox} from "../../components/ui";
import {cn} from "../../lib/cn";

type CatalogItem = {
  id: number;
  name: string;
  logoUrl?: string | null;
};

type CatalogPickerTone = "include" | "exclude";

type GenrePickerProps = {
  label: string;
  genres: CatalogItem[];
  selectedGenreIds: number[];
  onToggle: (genreId: number, checked: boolean) => void;
  onClear: () => void;
  tone?: CatalogPickerTone;
  emptyLabel?: string;
};

type ProviderPickerProps = {
  label: string;
  providers: MovieWatchProvider[];
  selectedProviderIds: number[];
  onToggle: (providerId: number, checked: boolean) => void;
  onClear: () => void;
  tone?: CatalogPickerTone;
  emptyLabel?: string;
};

type CatalogPickerProps = {
  label: string;
  items: CatalogItem[];
  selectedIds: number[];
  onToggle: (itemId: number, checked: boolean) => void;
  onClear: () => void;
  tone?: CatalogPickerTone;
  emptyLabel?: string;
  renderIcon?: (item: CatalogItem) => ReactNode;
};

const genreIconsById: Record<number, string> = {
  28: "🎬",
  12: "🏞️",
  16: "🎨",
  35: "😂",
  80: "🕵️",
  99: "📚",
  18: "🎭",
  10751: "👨‍👩‍👧",
  14: "🧙",
  36: "📜",
  27: "👻",
  10402: "🎵",
  9648: "🔍",
  10749: "❤️",
  878: "🚀",
  10770: "📺",
  53: "😨",
  10752: "⚔️",
  37: "🤠",
};

export function GenrePicker({
  label,
  genres,
  selectedGenreIds,
  onClear,
  onToggle,
  tone = "include",
  emptyLabel = "None",
}: GenrePickerProps) {
  return (
    <CatalogPicker
      label={label}
      items={genres}
      selectedIds={selectedGenreIds}
      onToggle={onToggle}
      onClear={onClear}
      tone={tone}
      emptyLabel={emptyLabel}
      renderIcon={renderGenreIcon}
    />
  );
}

export function ProviderPicker({
  label,
  providers,
  selectedProviderIds,
  onToggle,
  onClear,
  tone = "include",
  emptyLabel = "None",
}: ProviderPickerProps) {
  return (
    <CatalogPicker
      label={label}
      items={providers}
      selectedIds={selectedProviderIds}
      onToggle={onToggle}
      onClear={onClear}
      tone={tone}
      emptyLabel={emptyLabel}
      renderIcon={renderProviderIcon}
    />
  );
}

function CatalogPicker({
  label,
  items,
  selectedIds,
  onToggle,
  onClear,
  tone = "include",
  emptyLabel = "None",
  renderIcon = () => null,
}: CatalogPickerProps) {
  const [open, setOpen] = useState(false);
  const selected = items.filter((item) => selectedIds.includes(item.id));
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
          <span className="text-xs text-muted-foreground italic">{emptyLabel}</span>
        ) : (
          selected.map((item) => (
            <CatalogChip
              key={item.id}
              item={item}
              icon={renderIcon(item)}
              className={badgeClass}
              onRemove={() => onToggle(item.id, false)}
            />
          ))
        )}

        <Popover.Root open={open} onOpenChange={setOpen}>
          <Popover.Trigger asChild>
            <button
              type="button"
              className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.04] text-muted-foreground hover:text-foreground hover:border-white/[0.24] transition"
              aria-label={`Add ${label.toLowerCase()}`}>
              +
            </button>
          </Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              sideOffset={6}
              align="start"
              className="z-50 w-64 max-h-72 overflow-y-auto rounded-xl border border-white/[0.08] bg-surface/95 backdrop-blur p-2 shadow-xl outline-none">
              <div className="grid grid-cols-1 gap-0.5">
                {items.map((item) => (
                  <CatalogOption
                    key={item.id}
                    item={item}
                    checked={selectedIds.includes(item.id)}
                    icon={renderIcon(item)}
                    onCheckedChange={(checked) =>
                      onToggle(item.id, checked === true)
                    }
                  />
                ))}
              </div>
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </div>
    </div>
  );
}

function CatalogChip({
  className,
  icon,
  item,
  onRemove,
}: {
  className: string;
  icon: ReactNode;
  item: CatalogItem;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition hover:brightness-110",
        className,
      )}>
      {icon}
      {item.name}
      <span className="opacity-60">x</span>
    </button>
  );
}

function CatalogOption({
  checked,
  item,
  icon,
  onCheckedChange,
}: {
  checked: boolean;
  item: CatalogItem;
  icon?: ReactNode;
  onCheckedChange: (checked: boolean | "indeterminate") => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-foreground/90 hover:bg-white/[0.06]">
      <Checkbox checked={checked} onCheckedChange={onCheckedChange} />
      {icon}
      <span>{item.name}</span>
    </div>
  );
}

function renderProviderIcon(provider: CatalogItem) {
  if (!provider.logoUrl) {
    return (
      <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[9px] uppercase text-white/70">
        {provider.name.slice(0, 1)}
      </span>
    );
  }

  return (
    <img
      src={provider.logoUrl}
      alt={provider.name}
      className="h-4 w-4 rounded-full object-cover"
      aria-hidden="true"
    />
  );
}

function renderGenreIcon(genre: CatalogItem) {
  const icon = genreIconsById[genre.id];
  const fallback = genre.name.slice(0, 1);
  return (
    <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-white/10 text-[9px] uppercase text-white/70">
      {icon ?? fallback}
    </span>
  );
}
