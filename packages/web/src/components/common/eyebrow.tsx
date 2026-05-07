import type {HTMLAttributes} from "react";
import {cn} from "../../lib/cn";

type EyebrowProps = HTMLAttributes<HTMLDivElement> & {
  as?: "div" | "h3" | "span";
  size?: "sm" | "md";
};

export function Eyebrow({
  as: Component = "div",
  className,
  size = "md",
  ...props
}: EyebrowProps) {
  return (
    <Component
      className={cn(
        "font-semibold uppercase text-muted-foreground",
        size === "sm"
          ? "text-[11px] tracking-[0.22em]"
          : "text-[11px] tracking-[0.32em]",
        className,
      )}
      {...props}
    />
  );
}
