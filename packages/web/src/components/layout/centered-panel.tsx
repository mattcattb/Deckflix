import type {ReactNode} from "react";
import {cn} from "../../lib/cn";

type CenteredPanelProps = {
  children: ReactNode;
  className?: string;
};

export function CenteredPanel({children, className}: CenteredPanelProps) {
  return (
    <div
      className={cn(
        "flex flex-1 items-center justify-center px-5 py-12",
        className,
      )}>
      {children}
    </div>
  );
}
