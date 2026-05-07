import type {ReactNode} from "react";
import {useQuery} from "@tanstack/react-query";
import type {MovieCandidate} from "@deckflix/shared";
import {Eyebrow, StatusMessage} from "../../../components/common";
import {ModalShell} from "../../../components/layout";
import {movieDetailsQueryOptions} from "../movie-catalog.queries";

type MovieDetailsOverlayProps = {
  movie: MovieCandidate | null;
  movieId: string | null;
  onClose: () => void;
};

export function MovieDetailsOverlay({
  movie,
  movieId,
  onClose,
}: MovieDetailsOverlayProps) {
  const detailsQuery = useQuery({
    ...movieDetailsQueryOptions(movieId ?? "idle"),
    enabled: Boolean(movieId),
  });

  const details = detailsQuery.data ?? toFallbackMovieDetails(movie);

  return (
    <ModalShell open={Boolean(movieId)} onClose={onClose}>
      <div className="h-full overflow-y-auto">
          <div className="relative min-h-[18rem] overflow-hidden border-b border-white/10">
            {details.backdropUrl ? (
              <img
                src={details.backdropUrl}
                alt={details.title}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : null}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(4,4,6,0.18),rgba(4,4,6,0.82)_72%,rgba(4,4,6,1))]" />
            <div className="relative flex flex-col gap-6 px-5 pb-6 pt-20 sm:px-8 lg:flex-row lg:items-end lg:px-10">
              {details.posterUrl ? (
                <img
                  src={details.posterUrl}
                  alt={details.title}
                  className="h-64 w-44 shrink-0 rounded-[1.4rem] object-cover shadow-[0_24px_60px_rgba(0,0,0,0.45)]"
                />
              ) : null}
              <div className="max-w-3xl">
                <Eyebrow className="text-white/50">
                  TMDB movie details
                </Eyebrow>
                <h2 className="mt-3 text-4xl font-semibold leading-none text-white text-balance font-display sm:text-5xl">
                  {details.title}
                </h2>
                {details.tagline ? (
                  <p className="mt-3 text-base italic text-white/72 sm:text-lg">
                    {details.tagline}
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/74">
                  <span>{details.year || "Unknown year"}</span>
                  {details.runtimeMinutes ? (
                    <>
                      <span className="text-white/20">&bull;</span>
                      <span>{formatRuntime(details.runtimeMinutes)}</span>
                    </>
                  ) : null}
                  <span className="text-white/20">&bull;</span>
                  <span>{details.rating.toFixed(1)} TMDB</span>
                  {details.voteCount ? (
                    <span className="text-white/50">
                      ({formatCompactNumber(details.voteCount)} votes)
                    </span>
                  ) : null}
                </div>
                {details.genres.length > 0 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {details.genres.map((genre) => (
                      <span
                        key={genre}
                        className="rounded-full border border-white/12 bg-white/[0.08] px-3 py-1 text-xs font-medium text-white/80">
                        {genre}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="grid gap-8 px-5 py-6 sm:px-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(18rem,0.8fr)] lg:px-10">
            <div className="space-y-8">
              <section className="space-y-3">
                <Eyebrow className="text-white/45">
                  Overview
                </Eyebrow>
                <p className="max-w-3xl text-sm leading-7 text-white/74 sm:text-[15px]">
                  {details.overview || "No synopsis available yet."}
                </p>
              </section>
            </div>

            <aside className="space-y-4">
              <Eyebrow className="text-white/45">
                Facts
              </Eyebrow>
              <DetailFact label="Release">
                {details.releaseDate ? formatDate(details.releaseDate) : "Unknown"}
              </DetailFact>
              <DetailFact label="Status">{details.status || "Unknown"}</DetailFact>
              <DetailFact label="Original title">
                {details.originalTitle || details.title}
              </DetailFact>
              <DetailFact label="Language">
                {details.originalLanguage || "Unknown"}
              </DetailFact>
              {details.popularity ? (
                <DetailFact label="Popularity">
                  {formatCompactNumber(details.popularity)}
                </DetailFact>
              ) : null}
              {details.homepage ? (
                <DetailFact label="Homepage">
                  <a
                    href={details.homepage}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary transition hover:text-[hsl(357_92%_55%)]">
                    Visit site
                  </a>
                </DetailFact>
              ) : null}
              {details.imdbId ? (
                <DetailFact label="IMDb">
                  <a
                    href={`https://www.imdb.com/title/${details.imdbId}/`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary transition hover:text-[hsl(357_92%_55%)]">
                    {details.imdbId}
                  </a>
                </DetailFact>
              ) : null}
              {detailsQuery.isLoading ? (
                <StatusMessage className="rounded-[1.5rem]">
                  Loading TMDB details...
                </StatusMessage>
              ) : null}
              {detailsQuery.error ? (
                <StatusMessage tone="danger" className="rounded-[1.5rem]">
                  {detailsQuery.error instanceof Error
                    ? detailsQuery.error.message
                    : "Unable to load movie details"}
                </StatusMessage>
              ) : null}
            </aside>
          </div>
      </div>
    </ModalShell>
  );
}

function DetailFact({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-[1.5rem] border border-white/8 bg-white/[0.03] px-4 py-3">
      <Eyebrow className="text-white/45" size="sm">
        {label}
      </Eyebrow>
      <div className="mt-1 text-sm leading-6 text-white/78">{children}</div>
    </div>
  );
}

function toFallbackMovieDetails(movie: MovieCandidate | null) {
  return {
    id: movie?.id ?? "",
    title: movie?.title ?? "Movie",
    year: movie?.year ?? 0,
    overview: movie?.overview ?? "",
    posterUrl: movie?.posterUrl ?? "",
    rating: movie?.rating ?? 0,
    backdropUrl: "",
    releaseDate: "",
    runtimeMinutes: 0,
    genres: [] as string[],
    tagline: "",
    status: "",
    originalTitle: "",
    originalLanguage: "",
    voteCount: 0,
    popularity: 0,
    homepage: "",
    imdbId: "",
  };
}

function formatRuntime(runtimeMinutes: number) {
  const hours = Math.floor(runtimeMinutes / 60);
  const minutes = runtimeMinutes % 60;
  if (!hours) {
    return `${minutes}m`;
  }

  return `${hours}h ${minutes}m`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${value}T00:00:00`));
}

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
