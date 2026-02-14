import * as React from "react";
import { tv, type VariantProps } from "tailwind-variants";
import { cn } from "../../lib/cn";

const inputStyles = tv({
  base: [
    "flex w-full rounded-md border border-border bg-surface/60 px-3 py-2 text-sm text-foreground",
    "placeholder:text-muted-foreground",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "disabled:cursor-not-allowed disabled:opacity-60",
  ],
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
});

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
