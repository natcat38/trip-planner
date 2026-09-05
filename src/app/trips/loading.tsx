/**
 * Route-level fallback for `/trips` (the list) and `/trips/new`; `trips/[id]`
 * overrides it with its own page-shaped skeleton. Sized to the list page's
 * layout (title + actions row, then trip rows) so nothing shifts when the
 * real content swaps in. `/new` is a plain form with no slow reads, so this
 * realistically only ever paints for the list.
 * @packageDocumentation
 */

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

export default function TripsLoading() {
  return (
    <div className="flex flex-col flex-1 bg-surface">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-8 px-4 sm:py-16 sm:px-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-8">
          <Block className="h-10 w-48" />
          <div className="flex items-center gap-4">
            <Block className="h-4 w-16" />
            <Block className="h-9 w-24 rounded-full" />
          </div>
        </div>
        <div className="flex flex-col gap-3">
          <Block className="h-24 w-full rounded-lg" />
          <Block className="h-24 w-full rounded-lg" />
          <Block className="h-24 w-full rounded-lg" />
        </div>
      </main>
    </div>
  );
}
