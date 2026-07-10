import * as React from "react";
import {Slot} from "@radix-ui/react-slot";
import {cva, type VariantProps} from "class-variance-authority";
import { cn } from "../../lib/cn";

const badgeStyles = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        primary: "border-primary/30 bg-primary/15 text-primary",
        neutral: "border-white/10 bg-muted text-muted-foreground",
        success: "border-success/25 bg-success/15 text-success",
        warning: "border-warning/25 bg-warning/15 text-warning",
        danger: "border-danger/25 bg-danger/15 text-danger",
        outline: "border-white/20 text-foreground",
      },
    },
    defaultVariants: {
      variant: "neutral",
    },
  },
);

export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> &
  VariantProps<typeof badgeStyles> & {
    asChild?: boolean;
  };

export function Badge({asChild = false, className, variant, ...props}: BadgeProps) {
  const Comp = asChild ? Slot : "span";
  return <Comp className={cn(badgeStyles({ variant }), className)} {...props} />;
}
