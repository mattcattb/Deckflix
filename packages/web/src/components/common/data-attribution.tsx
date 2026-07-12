import {cn} from "../../lib/cn";

export function DataAttribution({
  className,
  includeJustWatch = false,
}: {
  className?: string;
  includeJustWatch?: boolean;
}) {
  return (
    <p className={cn("text-[11px] leading-relaxed text-white/35", className)}>
      This product uses the TMDB API but is not endorsed or certified by TMDB.
      {includeJustWatch
        ? " Streaming availability data provided by JustWatch."
        : ""}
    </p>
  );
}
