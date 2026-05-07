import type {ComponentProps} from "react";
import {Link} from "@tanstack/react-router";
import {cn} from "../../lib/cn";

type BrandMarkProps = {
  className?: string;
  size?: "sm" | "md" | "lg";
  to?: ComponentProps<typeof Link>["to"];
  uppercase?: boolean;
};

const sizeClasses = {
  sm: "text-lg",
  md: "text-2xl sm:text-3xl",
  lg: "text-5xl",
};

export function BrandMark({
  className,
  size = "md",
  to,
  uppercase = false,
}: BrandMarkProps) {
  const content = uppercase ? (
    <>
      DECK<span className="flame-text">FLIX</span>
    </>
  ) : (
    <>
      Deck<span className="flame-text">flix</span>
    </>
  );
  const classes = cn(
    "font-bold tracking-tight font-display",
    uppercase ? "uppercase" : "netflix-wordmark uppercase tracking-[0.08em]",
    sizeClasses[size],
    className,
  );

  if (to) {
    return (
      <Link to={to} className={classes}>
        {content}
      </Link>
    );
  }

  return <span className={classes}>{content}</span>;
}
