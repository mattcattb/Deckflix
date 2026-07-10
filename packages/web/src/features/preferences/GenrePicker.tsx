import {useMemo, useState, type ReactNode} from "react";
import type {MovieWatchProvider} from "@deckflix/shared";
import {Check, Plus, X} from "lucide-react";
import {
  Badge,
  Button,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../components/ui";
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
  const [search, setSearch] = useState("");
  const selected = items.filter((item) => selectedIds.includes(item.id));
  const badgeVariant = tone === "include" ? "primary" : "danger";
  const actionLabel =
    selected.length === 0 ? `Choose ${label.toLowerCase()}` : "Add";
  const filteredItems = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    if (!normalizedSearch) {
      return items;
    }

    return items.filter((item) =>
      item.name.toLowerCase().includes(normalizedSearch),
    );
  }, [items, search]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          {label}
        </span>
        {selected.length > 0 ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={onClear}>
            Clear
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {selected.length === 0 ? (
          <span className="text-xs italic text-muted-foreground">
            {emptyLabel}
          </span>
        ) : (
          selected.map((item) => (
            <CatalogChip
              key={item.id}
              item={item}
              icon={renderIcon(item)}
              variant={badgeVariant}
              onRemove={() => onToggle(item.id, false)}
            />
          ))
        )}

        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 rounded-full px-2.5 text-xs"
              aria-label={`Add ${label.toLowerCase()}`}>
              <Plus />
              {actionLabel}
            </Button>
          </PopoverTrigger>
          <PopoverContent
            sideOffset={8}
            align="start"
            className="w-[min(22rem,calc(100vw-2rem))] p-2">
            <div className="space-y-2">
              <Input
                value={search}
                onChange={(event) => setSearch(event.currentTarget.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="h-9"
                autoFocus
              />
              <div className="max-h-72 overflow-y-auto pr-1">
                {filteredItems.length === 0 ? (
                  <div className="px-2 py-6 text-center text-sm text-muted-foreground">
                    {items.length === 0
                      ? "No options are available."
                      : "No results found."}
                  </div>
                ) : (
                  <div className="grid gap-1">
                    {filteredItems.map((item) => {
                      const checked = selectedIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-left text-sm text-foreground/90 transition hover:bg-white/[0.06]"
                          onClick={() => onToggle(item.id, !checked)}>
                          <span
                            className={cn(
                              "flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border border-white/20",
                              checked &&
                                "border-primary bg-primary text-primary-foreground",
                            )}>
                            {checked ? <Check className="h-3 w-3" /> : null}
                          </span>
                          {renderIcon(item)}
                          <span className="truncate">{item.name}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}

function CatalogChip({
  icon,
  item,
  onRemove,
  variant,
}: {
  icon: ReactNode;
  item: CatalogItem;
  onRemove: () => void;
  variant: "danger" | "primary";
}) {
  return (
    <Badge asChild variant={variant} className="max-w-full gap-1.5 py-1">
      <button type="button" onClick={onRemove}>
        {icon}
        <span className="truncate">{item.name}</span>
        <X className="h-3 w-3 opacity-65" />
      </button>
    </Badge>
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
      alt=""
      className="h-4 w-4 rounded-full object-cover"
      aria-hidden="true"
    />
  );
}

function renderGenreIcon() {
  return (
    <span
      className="inline-flex h-2.5 w-2.5 rounded-full bg-white/25"
      aria-hidden="true"
    />
  );
}
