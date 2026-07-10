import * as React from "react";
import {cva, type VariantProps} from "class-variance-authority";
import { cn } from "../../lib/cn";

const inputStyles = cva(
  [
    "flex w-full rounded-lg border border-white/[0.08] bg-white/[0.04] px-4 py-2 text-sm text-foreground",
    "placeholder:text-muted-foreground/60",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:border-accent/40",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "transition-all duration-200",
  ],
  {
    variants: {
      size: {
        sm: "h-9",
        md: "h-11",
        lg: "h-12 text-base",
      },
    },
    defaultVariants: {
      size: "md",
    },
  },
);

export type InputProps = React.InputHTMLAttributes<HTMLInputElement> &
  VariantProps<typeof inputStyles>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, size, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(inputStyles({ size }), className)}
        {...props}
      />
    );
  }
);

Input.displayName = "Input";
