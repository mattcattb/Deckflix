import { Checkbox as BaseCheckbox } from "@base-ui/react/checkbox";
import { cn } from "../../lib/cn";

export type CheckboxProps = BaseCheckbox.Root.Props & {
  label?: string;
};

export function Checkbox({ className, label, ...props }: CheckboxProps) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-foreground/90">
      <BaseCheckbox.Root
        className={cn(
          "inline-flex h-5 w-5 items-center justify-center rounded border border-border bg-surface/70",
          "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "data-[checked]:border-primary data-[checked]:bg-primary",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className
        )}
        {...props}
      >
        <BaseCheckbox.Indicator className="text-primary-foreground data-[unchecked]:opacity-0">
          <svg
            viewBox="0 0 16 16"
            className="h-3.5 w-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3.5 8.5l3 3 6-7" />
          </svg>
        </BaseCheckbox.Indicator>
      </BaseCheckbox.Root>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
