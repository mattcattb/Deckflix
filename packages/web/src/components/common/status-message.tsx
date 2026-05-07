import type {HTMLAttributes} from "react";
import {cn} from "../../lib/cn";

type StatusMessageProps = HTMLAttributes<HTMLDivElement> & {
  tone?: "danger" | "muted" | "success";
};

const toneClasses = {
  danger: "border-danger/30 bg-danger/10 text-danger",
  muted: "border-white/8 bg-white/[0.03] text-white/62",
  success: "border-swipe-like/20 bg-swipe-like/10 text-swipe-like",
};

export function StatusMessage({
  className,
  tone = "muted",
  ...props
}: StatusMessageProps) {
  return (
    <div
      className={cn(
        "rounded-xl border px-4 py-3 text-sm",
        toneClasses[tone],
        className,
      )}
      {...props}
    />
  );
}
