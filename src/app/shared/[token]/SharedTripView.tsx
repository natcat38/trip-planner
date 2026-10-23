import Link from 'next/link';
import { Wordmark } from '@/components/Wordmark';
import { dayAnchorId } from '@/lib/dayAnchor';
import { formatMoney } from '@/lib/money';
import { formatDay, formatDateRange } from '@/lib/format';
import type {
  getSharedBudgetSummary,
  getSharedTrip,
  listSharedExpenses,
} from '@/server/sharing';
import { ThemeToggle } from '@/app/ThemeToggle';
import {
  budgetBannerText,
  CategoryShareBar,
} from '@/app/trips/[id]/BudgetPanel';
import { DuplicateCopyForm } from './DuplicateCopyForm';
import { SharedTripBody, type DayChip } from './SharedTripBody';

type SharedTripData = Awaited<ReturnType<typeof getSharedTrip>>;
type BudgetSummary = Awaited<ReturnType<typeof getSharedBudgetSummary>>;
type SharedExpenses = Awaited<ReturnType<typeof listSharedExpenses>>;

export function SharedTripView({
  data,
  budget,
  expenses,
  token,
  canSaveCopy,
}: {
  data: SharedTripData;
  budget: BudgetSummary;
  expenses: SharedExpenses;
  token: string;
  canSaveCopy: boolean;
}) {
  const { trip, days } = data;

  const pins = days
    .flatMap((day) => day.activities)
    .filter((activity) => activity.lat != null && activity.lng != null)
    .map((activity) => ({
      id: activity.id,
      lat: activity.lat!,
      lng: activity.lng!,
      title: activity.title,
    }));

  // Strings are formatted here, on the server, so the client strip never
  // formats a date (see the locale note in src/lib/format.ts).
  const chipFormat = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
  const dayChips: DayChip[] = days.map((day) => ({
    id: day.id,
    short: chipFormat.format(day.date),
    full: formatDay(day.date),
  }));

  return (
    <div className="flex flex-col flex-1 bg-surface">
      {/* No AppHeader — this route is the one other unauthenticated page
          (src/proxy.ts doesn't match /shared/*), so it gets its own slim
          header: the product name linking home, a read-only badge (from sm;
          on a phone it sits under the trip title), and the theme control.
          TODO(Natalie): a "View a sample trip" / "Plan your own trip" call to
          action belongs in this row once the copy is decided. */}
      <header className="w-full border-b border-border print:hidden">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 py-1 sm:px-8 sm:py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Wordmark />
            <span className="hidden rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-fg sm:inline-flex">
              Read-only shared view
            </span>
          </div>
          <ThemeToggle />
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        // Same width as the signed-in trip page (max-w-6xl) so the two-pane
        // layout below has the room the map pane needs.
        className="flex-1 w-full max-w-6xl mx-auto py-6 px-4 sm:py-10 sm:px-8"
      >
        {/* Cover header (ADR-0019 M10 C6): trip name, destinations, date
            range, and day count — every field here already comes from
            data.trip/data.days, exactly what getSharedTrip() (src/server/
            sharing.ts) returns after stripping userId/shareToken. Nothing
            added is owner-identifying: no email, no userId, no token. */}
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <h1 className="text-4xl font-semibold text-foreground">
            {trip.name}
          </h1>
          {canSaveCopy && <DuplicateCopyForm token={token} />}
        </div>
        <p className="mb-3 text-sm text-muted-fg sm:mb-5">
          {trip.destinations.join(', ')}
          {trip.destinations.length > 0 && ' · '}
          <span className="font-mono tabular-nums">
            {formatDateRange(trip.startDate, trip.endDate)}
          </span>{' '}
          · <span className="font-mono tabular-nums">{days.length}</span>{' '}
          {days.length === 1 ? 'day' : 'days'}
        </p>
        <p className="mb-5 inline-flex rounded-full border border-border px-2.5 py-0.5 text-xs text-muted-fg sm:hidden print:hidden">
          Read-only shared view
        </p>

        {/* TRIP-UX-1: the budget is one slim summary bar; the breakdown
            (categories, unconverted items, expense list) is behind it. It
            opens by default only when an item could not be converted, since
            then the headline number comes with a caveat the visitor should
            see. */}
        <details
          open={budget.unconvertedItems.length > 0}
          className="group mb-6 rounded-lg border border-border bg-surface-raised"
        >
          <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 [&::-webkit-details-marker]:hidden">
            <h2 className="text-15 font-medium text-foreground">Budget</h2>
            <span className="ml-auto inline-flex items-center gap-1 text-sm text-muted-fg sm:order-last">
              Breakdown
              <svg
                aria-hidden="true"
                viewBox="0 0 20 20"
                width="14"
                height="14"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="transition-transform group-open:rotate-180"
              >
                <path d="M5 7.5 10 12.5 15 7.5" />
              </svg>
            </span>
            <span className="basis-full sm:hidden" aria-hidden="true" />
            {/* Same departure-board treatment as BudgetPanel.tsx, at summary
                size. */}
            <span className="flex items-baseline gap-2">
              <span
                className={`inline-flex items-baseline rounded-full px-3 py-0.5 font-mono tabular-nums text-xl font-semibold ${
                  budget.isOverBudget
                    ? 'bg-danger text-danger-fg'
                    : 'bg-positive text-positive-fg'
                }`}
              >
                {formatMoney(
                  Math.abs(budget.remainingMinor),
                  budget.baseCurrency,
                )}
              </span>
              <span className="text-sm text-muted-fg">
                {budget.isOverBudget ? 'over budget' : 'remaining'}
              </span>
            </span>
            <span
              className={
                budget.isOverBudget
                  ? 'text-danger text-sm'
                  : 'text-zinc-700 dark:text-zinc-300 text-sm'
              }
            >
              {budgetBannerText(
                budget.spentMinor,
                budget.budgetMinor,
                budget.baseCurrency,
              )}
            </span>
          </summary>

          <div className="border-t border-border px-4 pb-4">
            {Object.keys(budget.byCategory).length > 0 && (
              <CategoryShareBar
                byCategory={budget.byCategory}
                spentMinor={budget.spentMinor}
                currency={budget.baseCurrency}
              />
            )}

            {budget.unconvertedItems.length > 0 && (
              <div className="mt-4 rounded-lg bg-warning p-3">
                <ul className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm text-warning-fg">
                  {budget.unconvertedItems.map((item) => (
                    <li key={item.id} className="contents">
                      <span>
                        {item.label} — showing original amount, conversion rate
                        unavailable.
                      </span>
                      <span className="font-mono tabular-nums text-right">
                        {formatMoney(item.originalMinor, item.originalCurrency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {expenses.length > 0 && (
              <ul className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm text-muted-fg">
                {expenses.map((expense) => (
                  <li key={expense.id} className="contents">
                    <span>
                      {expense.label} ({expense.category})
                    </span>
                    <span className="font-mono tabular-nums text-right">
                      {formatMoney(expense.costMinor, expense.costCurrency)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>

        {/* Read-only view: no pin selection, so no handler to pass — and a
            Server Component cannot pass one to a Client Component anyway. */}
        <SharedTripBody pins={pins} days={dayChips}>
          <div className="mt-6 flex flex-col gap-6">
            {days.map((day) => (
              <section
                key={day.id}
                id={dayAnchorId(day.id)}
                className="day-anchor"
              >
                {/* now/next highlighting (ItineraryDays.tsx's NowProvider/
                    TodayBadge/NextBadge) is scoped to the authenticated view
                    only, pending ADR-0019 open question 3 — a visitor on a
                    read-only share link sees no "now"/"next" badges. */}
                <h2 className="text-lg font-medium text-foreground mb-3 border-b border-border pb-2 font-mono tabular-nums">
                  {formatDay(day.date)}
                </h2>
                {day.activities.length > 0 ? (
                  <ul className="flex flex-col gap-2 mt-3">
                    {day.activities.map((activity) => (
                      <li
                        key={activity.id}
                        // Card.tsx only renders 'div' | 'section' — an <li>
                        // can't compose it without nesting a block element
                        // that isn't valid inside a <ul>, so this className is
                        // Card's own literal (rounded-lg border border-border
                        // bg-surface-raised) copied rather than shared, kept
                        // in sync by hand. See fix-report-itinerary.md.
                        className="rounded-lg border border-border bg-surface-raised p-4"
                      >
                        {/* Departure-board columns (ADR-0019 §4,
                            design-critique.md finding #1): time in its own
                            tabular-numeral column, title/category/place/notes
                            in the middle, cost right-aligned — matches
                            BudgetPanel.tsx's grid-cols-[1fr_auto_auto]
                            pattern. */}
                        <div className="grid grid-cols-[auto_1fr_auto] gap-x-3">
                          <span className="font-mono tabular-nums text-sm text-muted-fg">
                            {activity.startTime && activity.endTime
                              ? `${activity.startTime}–${activity.endTime}`
                              : (activity.startTime ?? '')}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground">
                              {activity.title}{' '}
                              <span className="font-normal text-zinc-500 dark:text-zinc-400">
                                ({activity.category})
                              </span>
                            </p>
                            {activity.placeName && (
                              <p className="text-sm text-muted-fg">
                                {activity.placeName}
                              </p>
                            )}
                            {activity.notes && (
                              <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                                {activity.notes}
                              </p>
                            )}
                          </div>
                          <span className="font-mono tabular-nums text-sm text-muted-fg text-right">
                            {activity.costMinor != null && activity.costCurrency
                              ? formatMoney(
                                  activity.costMinor,
                                  activity.costCurrency,
                                )
                              : ''}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-3">
                    No activities planned.
                  </p>
                )}
              </section>
            ))}
          </div>
        </SharedTripBody>

        <footer className="mt-12 border-t border-border pt-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
          Planned with{' '}
          <Link href="/" className="underline">
            Trip Planner
          </Link>
        </footer>
      </main>
    </div>
  );
}
