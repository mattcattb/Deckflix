import * as SwitchPrimitive from "@radix-ui/react-switch";
import { cn } from "../../lib/cn";

export type SwitchProps = SwitchPrimitive.SwitchProps & {
  label?: string;
};

export function Switch({ className, label, ...props }: SwitchProps) {
  return (
    <label className="inline-flex items-center gap-3 text-sm text-foreground/90">
      <SwitchPrimitive.Root
        className={cn(
          "relative inline-flex h-6 w-11 items-center rounded-full border border-border bg-muted",
          "transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          "data-[state=checked]:bg-primary data-[state=checked]:border-primary",
          "disabled:cursor-not-allowed disabled:opacity-60",
          className
        )}
        {...props}
      >
        <SwitchPrimitive.Thumb
          className={cn(
            "inline-block h-4 w-4 translate-x-1 rounded-full bg-foreground",
            "transition data-[state=checked]:translate-x-6 data-[state=checked]:bg-primary-foreground"
          )}
        />
      </SwitchPrimitive.Root>
      {label ? <span>{label}</span> : null}
    </label>
  );
}
