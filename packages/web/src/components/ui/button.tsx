import * as React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../lib/cn";

export const buttonStyles = tv({
  base: [
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-60",
  ],
  variants: {
    variant: {
      primary:
        "bg-primary text-primary-foreground shadow-glow hover:brightness-105 active:brightness-95",
      secondary:
        "bg-surface-elevated text-foreground hover:bg-surface-elevated/85",
      outline:
        "border border-border text-foreground hover:border-primary/60 hover:bg-primary/10",
      ghost: "text-foreground hover:bg-muted/60",
      danger:
        "bg-danger text-white hover:brightness-110 active:brightness-95",
    },
    size: {
      sm: "h-9 px-3 text-sm",
      md: "h-11 px-4 text-sm",
      lg: "h-12 px-6 text-base",
    },
    effect: {
      none: "",
      glow: "btn-glow",
      sheen: "btn-sheen",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
    effect: "none",
  },
});

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles>;

export function Button({
  className,
  variant,
  size,
  effect,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonStyles({ variant, size, effect }), className)}
      {...props}
    />
  );
}
