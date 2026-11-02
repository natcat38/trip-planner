/**
 * Route-level fallback for every page under `trips/[id]/*` (itinerary, edit,
 * print, activities/*; places/ overrides it with its own skeleton). Built
 * from the itinerary page's own shell and grid (PAGE_SHELL.wide, TRIP_GRID)
 * and its parts in the same order — breadcrumb, title, tabs, then budget bar,
 * map and day cards — so nothing shifts when the real page swaps in
 * (TRIP-UX-7). The edit/print pages are narrower than this; they have no
 * slow read, so this realistically never paints for them. `/print` is also
 * light-mode-only, unlike this skeleton's `dark:` blocks.
 * @packageDocumentation
 */

import { PAGE_SHELL, TRIP_GRID } from '@/components/pageShell';

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

function DayBlock({ rows }: { rows: number }) {
  return (
    <div>
      <Block className="mb-3 h-6 w-48" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, index) => (
          <Block key={index} className="h-[4.5rem] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function TripLoading() {
  return (
    <div className="flex flex-col flex-1 bg-surface">
      <main id="main" tabIndex={-1} className={PAGE_SHELL.wide}>
        <Block className="mb-2 h-4 w-48" />
        <Block className="mb-3 h-10 w-72" />
        <div className="mb-6 flex items-center justify-between gap-4 border-b border-border pb-2">
          <div className="flex gap-4">
            <Block className="h-5 w-16" />
            <Block className="h-5 w-14" />
          </div>
          <div className="flex gap-2">
            <Block className="h-9 w-24 rounded-full" />
            <Block className="h-9 w-24 rounded-full" />
          </div>
        </div>

        <div className={TRIP_GRID}>
          <div className="lg:col-start-2 lg:row-start-1">
            <Block className="h-[5.25rem] w-full rounded-lg" />
          </div>
          <div className="lg:col-start-2 lg:row-start-3">
            <Block className="h-80 w-full rounded-lg lg:h-[36rem]" />
          </div>
          <div className="flex min-w-0 flex-col gap-8 lg:col-start-1 lg:row-span-3 lg:row-start-1">
            <DayBlock rows={3} />
            <DayBlock rows={3} />
          </div>
        </div>
      </main>
    </div>
  );
}
