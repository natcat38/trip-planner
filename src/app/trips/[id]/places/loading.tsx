/**
 * Fallback for the Places route while its page component's own async work
 * (auth check, guide fetch, geocode, saved-places list) resolves — this
 * route can otherwise sit blank for a while (`maxDuration = 60`, see
 * `page.tsx`'s header comment on Overpass 504s/retries). Sized to
 * `page.tsx`'s actual sections: header/back-link row, the destination guide
 * card, the search form + results card, and the saved-places map + list.
 * @packageDocumentation
 */

function Block({ className }: { className: string }) {
  return (
    <div
      className={`animate-pulse rounded bg-zinc-200 dark:bg-zinc-800 ${className}`}
    />
  );
}

export default function PlacesLoading() {
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-16 px-8"
      >
        <div className="flex items-baseline justify-between mb-8">
          <Block className="h-8 w-64" />
          <Block className="h-4 w-32" />
        </div>

        <div className="mb-10 rounded-lg border border-border p-5">
          <Block className="h-5 w-40 mb-3" />
          <Block className="h-4 w-full mb-2" />
          <Block className="h-4 w-3/4" />
        </div>

        <div className="mb-10 rounded-lg border border-border p-5">
          <Block className="h-5 w-32 mb-4" />
          <div className="flex flex-wrap gap-3 mb-4">
            <Block className="h-9 flex-1" />
            <Block className="h-9 w-40" />
            <Block className="h-9 w-24" />
          </div>
          <Block className="h-4 w-56" />
        </div>

        <div>
          <Block className="h-5 w-32 mb-4" />
          <Block className="h-80 w-full rounded-lg mb-4" />
          <div className="flex flex-col gap-3">
            <Block className="h-16 w-full rounded-lg" />
            <Block className="h-16 w-full rounded-lg" />
          </div>
        </div>
      </main>
    </div>
  );
}
