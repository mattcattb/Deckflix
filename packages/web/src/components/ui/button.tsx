import * as React from "react";
import {Slot} from "@radix-ui/react-slot";
import {cva, type VariantProps} from "class-variance-authority";
import { cn } from "../../lib/cn";

const buttonStyles = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-semibold tracking-wide transition-all cursor-pointer",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-primary text-primary-foreground hover:bg-[hsl(357_92%_52%)] active:brightness-90 active:scale-[0.99]",
        secondary:
          "bg-white/[0.08] text-foreground hover:bg-white/[0.16]",
        outline:
          "border border-white/30 text-foreground hover:border-white hover:bg-white/10",
        ghost:
          "text-muted-foreground hover:text-foreground hover:bg-white/[0.08]",
        danger:
          "bg-danger text-white hover:brightness-110 active:brightness-95",
      },
      size: {
        icon: "h-9 w-9",
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
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonStyles> & {
    asChild?: boolean;
  };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      asChild = false,
      className,
      variant,
      size,
      effect,
      type = "button",
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        type={asChild ? undefined : type}
        className={cn(buttonStyles({variant, size, effect}), className)}
        {...props}
      />
    );
  },
);

Button.displayName = "Button";
