import * as React from "react";
import { cn } from "../../lib/cn";

export function Card({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-[hsl(0_0%_9%)] p-5 shadow-[0_2px_8px_rgba(0,0,0,0.5)] ring-1 ring-white/[0.04]",
        className
      )}
      {...props}
    />
  );
}

export function CardContent({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mt-3", className)} {...props} />;
}
