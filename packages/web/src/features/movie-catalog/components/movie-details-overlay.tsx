import {useQuery} from "@tanstack/react-query";
import type {MovieCandidate, MovieWatchProvider} from "@deckflix/shared";
import {Eyebrow, StatusMessage} from "../../../components/common";
import {ModalShell} from "../../../components/layout";
import {movieDetailsQueryOptions} from "../movie-catalog.queries";

type MovieDetailsOverlayProps = {
  movie: MovieCandidate | null;
  movieId: string | null;
  watchRegion?: string;
  onClose: () => void;
};

export function MovieDetailsOverlay({
  movie,
  movieId,
  watchRegion = "US",
  onClose,
}: MovieDetailsOverlayProps) {
  const detailsQuery = useQuery({
    ...movieDetailsQueryOptions(movieId ?? "idle", "en-US", watchRegion),
    enabled: Boolean(movieId),
  });

  const details = detailsQuery.data ?? toFallbackMovieDetails(movie, watchRegion);
  const hasWatchProviders =
    details.watchProviders.stream.length +
      details.watchProviders.rent.length +
      details.watchProviders.buy.length >
    0;

  return (
    <ModalShell open={Boolean(movieId)} onClose={onClose}>
      <div className="h-full overflow-y-auto">
        <section className="relative min-h-[16rem] overflow-hidden border-b border-white/10">
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
                <span className="text-white/20">&bull;</span>
                <span>Popularity {formatCompactNumber(details.popularity ?? 0)}</span>
                {details.contentRating ? (
                  <>
                    <span className="text-white/20">&bull;</span>
                    <span>{details.contentRating}</span>
                  </>
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
        </section>

        <div className="space-y-6 px-5 py-6 sm:px-8 lg:px-10">
          <section className="space-y-3">
            <Eyebrow className="text-white/45">Overview</Eyebrow>
            <p className="max-w-3xl text-sm leading-7 text-white/74 sm:text-[15px]">
              {details.overview || "No synopsis available yet."}
            </p>
          </section>

        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <Eyebrow className="text-white/45">Where to watch</Eyebrow>
            <span className="text-xs text-white/55">
              {details.watchProviders.region}
            </span>
          </div>
          {details.watchProviders.link ? (
            <a
              href={details.watchProviders.link}
              target="_blank"
              rel="noreferrer"
              className="inline-flex text-xs text-primary hover:text-primary/80">
              Open in JustWatch
            </a>
          ) : null}

          {hasWatchProviders ? (
            <div className="grid gap-4 md:grid-cols-3">
                <WatchProviderSection
                  title="Stream"
                  providers={details.watchProviders.stream}
                />
                <WatchProviderSection
                  title="Rent"
                  providers={details.watchProviders.rent}
                />
                <WatchProviderSection
                  title="Buy"
                  providers={details.watchProviders.buy}
                />
              </div>
            ) : (
              <StatusMessage tone="info" className="rounded-lg px-3 py-2">
                No watch providers were found for this region.
              </StatusMessage>
            )}
          </section>

          {detailsQuery.isLoading ? (
            <StatusMessage className="rounded-lg">Loading TMDB details...</StatusMessage>
          ) : null}
          {detailsQuery.error ? (
            <StatusMessage tone="danger" className="rounded-lg">
              {detailsQuery.error instanceof Error
                ? detailsQuery.error.message
                : "Unable to load movie details"}
            </StatusMessage>
          ) : null}
        </div>
      </div>
    </ModalShell>
  );
}

function WatchProviderSection({
  title,
  providers,
}: {
  title: string;
  providers: MovieWatchProvider[];
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
      <h3 className="mb-3 text-sm font-semibold text-white/80">{title}</h3>
      {providers.length === 0 ? (
        <p className="text-xs text-white/55">None</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {providers.map((provider) => (
            <ProviderBadge key={provider.id} provider={provider} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProviderBadge({provider}: {provider: MovieWatchProvider}) {
  if (!provider.logoUrl) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-xs text-white/85">
        {provider.name}
      </span>
    );
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.05] px-2.5 py-1 text-xs text-white/85">
      <img
        src={provider.logoUrl}
        alt={provider.name}
        className="h-4 w-4 rounded-full object-cover"
        aria-hidden="true"
      />
      <span>{provider.name}</span>
    </div>
  );
}

function toFallbackMovieDetails(movie: MovieCandidate | null, region: string) {
  return {
    id: movie?.id ?? "",
    title: movie?.title ?? "Movie",
    year: movie?.year ?? 0,
    overview: movie?.overview ?? "",
    posterUrl: movie?.posterUrl ?? "",
    rating: movie?.rating ?? 0,
    backdropUrl: "",
    runtimeMinutes: 0,
    genres: [] as string[],
    popularity: 0,
    contentRating: "",
    watchProviders: {
      region,
      stream: [],
      rent: [],
      buy: [],
    },
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

function formatCompactNumber(value: number) {
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}
