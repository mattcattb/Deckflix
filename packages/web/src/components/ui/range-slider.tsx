import * as SliderPrimitive from "@radix-ui/react-slider";
import {cn} from "../../lib/cn";
import {Switch} from "./switch";

export type RangeSliderProps = {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: [number, number] | null;
  defaultRange?: [number, number];
  onChange: (value: [number, number] | null) => void;
  formatValue?: (value: number) => string;
  className?: string;
};

export function RangeSlider({
  label,
  min,
  max,
  step = 1,
  value,
  defaultRange,
  onChange,
  formatValue = (v) => String(v),
  className,
}: RangeSliderProps) {
  const enabled = value !== null;
  const current = value ?? defaultRange ?? [min, max];

  return (
    <div
      className={cn(
        "rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3",
        className,
      )}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-medium truncate">{label}</span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {enabled
              ? `${formatValue(current[0])} – ${formatValue(current[1])}`
              : "All"}
          </span>
        </div>
        <Switch
          checked={enabled}
          onCheckedChange={(checked) =>
            onChange(checked ? (defaultRange ?? [min, max]) : null)
          }
        />
      </div>

      {enabled ? (
        <SliderPrimitive.Root
          value={current}
          min={min}
          max={max}
          step={step}
          minStepsBetweenThumbs={1}
          onValueChange={(next) =>
            onChange([next[0] ?? min, next[1] ?? max])
          }
          className="relative mt-3 flex h-5 w-full touch-none select-none items-center">
          <SliderPrimitive.Track className="relative h-1.5 w-full grow overflow-hidden rounded-full bg-white/[0.08]">
            <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-flame-start via-flame-mid to-flame-end" />
          </SliderPrimitive.Track>
          <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full bg-foreground shadow-[0_0_0_2px_hsl(4_90%_58%/0.6)] cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
          <SliderPrimitive.Thumb className="block h-4 w-4 rounded-full bg-foreground shadow-[0_0_0_2px_hsl(4_90%_58%/0.6)] cursor-grab active:cursor-grabbing focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
        </SliderPrimitive.Root>
      ) : null}
    </div>
  );
}
