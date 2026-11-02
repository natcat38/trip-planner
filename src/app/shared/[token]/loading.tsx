/**
 * Route-level fallback for the public share link while getSharedTrip,
 * getSharedBudgetSummary and listSharedExpenses resolve (page.tsx runs them
 * in parallel via Promise.all). Built from SharedTripView's own shell
 * (PAGE_SHELL.shared, HEADER_WIDTH.wide) and its parts in the same order —
 * header row, title, budget bar, then the itinerary beside a 26rem map pane
 * from `lg` — so nothing shifts when the real page swaps in (TRIP-UX-7).
 * No AppHeader: this route has no auth gate at all (see page.tsx's file
 * header comment).
 *
 * Deliberately carries no package-documentation tag: FILE-MAP.md takes a
 * directory's purpose from the first file declaring one, and this filename
 * sorts ahead of page.tsx — the route's description belongs there, not here.
 */

import { ThemeToggle } from '@/app/ThemeToggle';
import { HEADER_WIDTH, PAGE_SHELL } from '@/components/pageShell';
import { Wordmark } from '@/components/Wordmark';

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

function DayBlock({ rows }: { rows: number }) {
  return (
    <div>
      <Block className="mb-3 h-7 w-48" />
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }, (_, index) => (
          <Block key={index} className="h-[4.5rem] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

export default function SharedTripLoading() {
  return (
    <div className="flex flex-col flex-1 bg-surface">
      <header className="w-full border-b border-border print:hidden">
        <div
          className={`mx-auto flex w-full ${HEADER_WIDTH.wide} items-center justify-between gap-3 px-4 py-1 sm:px-8 sm:py-3`}
        >
          <Wordmark />
          <ThemeToggle />
        </div>
      </header>
      <main id="main" tabIndex={-1} className={PAGE_SHELL.shared}>
        <Block className="mb-2 h-10 w-72" />
        <Block className="mb-5 h-4 w-64" />
        <Block className="mb-6 h-[3.25rem] w-full rounded-lg" />

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
          <div className="flex min-w-0 flex-1 flex-col gap-6">
            <Block className="h-11 w-full rounded-full sm:h-9" />
            <DayBlock rows={3} />
            <DayBlock rows={2} />
          </div>
          <Block className="hidden lg:block lg:h-[36rem] lg:w-[26rem] lg:shrink-0 rounded-lg" />
        </div>
      </main>
    </div>
  );
}
