import * as React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../lib/cn";

const badgeStyles = tv({
  base: "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
  variants: {
    variant: {
      primary: "bg-primary/20 text-primary",
      neutral: "bg-muted text-muted-foreground",
      success: "bg-success/20 text-success",
      warning: "bg-warning/20 text-warning",
      danger: "bg-danger/20 text-danger",
    },
  },
  defaultVariants: {
    variant: "neutral",
  },
});

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeStyles>;

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeStyles({ variant }), className)} {...props} />;
}
