/**
 * Route-level fallback for the public share link while getSharedTrip,
 * getSharedBudgetSummary and listSharedExpenses resolve (page.tsx runs them
 * in parallel via Promise.all). Sized to SharedTripView's actual layout —
 * title row, budget card, day cards — same skeleton pattern as
 * trips/[id]/loading.tsx. No AppHeader: this route has no auth gate at all
 * (see page.tsx's file header comment).
 *
 * Deliberately carries no package-documentation tag: FILE-MAP.md takes a
 * directory's purpose from the first file declaring one, and this filename
 * sorts ahead of page.tsx — the route's description belongs there, not here.
 */

import { Card } from '@/components/Card';
import { ThemeToggle } from '@/app/ThemeToggle';

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded bg-border ${className}`} />;
}

export default function SharedTripLoading() {
  return (
    <div className="flex flex-col flex-1 bg-surface">
      <div className="flex w-full justify-end px-4 py-3 sm:px-8 print:hidden">
        <ThemeToggle />
      </div>
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-16 px-8"
      >
        <div className="flex items-baseline justify-between mb-8">
          <Block className="h-8 w-56" />
          <Block className="h-4 w-24" />
        </div>

        <Card className="mb-10">
          <Block className="h-5 w-24 mb-3" />
          <Block className="h-4 w-64" />
        </Card>

        <div className="flex flex-col gap-8">
          <div>
            <Block className="h-5 w-40 mb-3" />
            <div className="flex flex-col gap-2">
              <Block className="h-16 w-full rounded-lg" />
              <Block className="h-16 w-full rounded-lg" />
            </div>
          </div>

          <div>
            <Block className="h-5 w-40 mb-3" />
            <div className="flex flex-col gap-2">
              <Block className="h-16 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
