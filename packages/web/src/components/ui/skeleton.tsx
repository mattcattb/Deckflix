import type * as React from "react";
import {cn} from "../../lib/cn";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse rounded-md bg-white/[0.08]", className)}
      {...props}
    />
  );
}

export {Skeleton};
