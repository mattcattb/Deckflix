import * as React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../lib/cn";

export const buttonStyles = tv({
  base: [
    "inline-flex items-center justify-center gap-2 rounded-lg font-semibold tracking-wide uppercase transition-all cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
  ],
  variants: {
    variant: {
      primary:
        "bg-gradient-to-r from-flame-start via-flame-mid to-flame-end text-white shadow-[0_4px_24px_hsl(4_90%_58%/0.35)] hover:shadow-[0_4px_32px_hsl(4_90%_58%/0.5)] hover:brightness-110 active:brightness-95 active:scale-[0.98]",
      secondary:
        "bg-white/[0.06] text-foreground border border-white/[0.08] hover:bg-white/[0.1] hover:border-white/[0.14]",
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
      flame: "flame-breathe",
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
