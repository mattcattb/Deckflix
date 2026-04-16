import * as React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../lib/cn";

export const buttonStyles = tv({
  base: [
    "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-all cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  variants: {
    variant: {
      primary:
        "bg-primary text-primary-foreground shadow-[0_0_20px_hsl(350_85%_56%/0.3)] hover:shadow-[0_0_28px_hsl(350_85%_56%/0.45)] hover:brightness-110 active:brightness-95",
      secondary:
        "bg-white/[0.06] text-foreground border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.12]",
      outline:
        "border border-white/[0.1] text-foreground hover:border-primary/50 hover:bg-primary/10 hover:text-primary",
      ghost: "text-muted-foreground hover:text-foreground hover:bg-white/[0.06]",
      danger:
        "bg-danger text-white shadow-[0_0_16px_hsl(0_72%_56%/0.25)] hover:brightness-110 active:brightness-95",
    },
    size: {
      sm: "h-9 px-3.5 text-sm",
      md: "h-11 px-5 text-sm",
      lg: "h-12 px-7 text-base",
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
