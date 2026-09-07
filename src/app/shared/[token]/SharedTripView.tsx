import Link from 'next/link';
import { Map } from '@/components/Map';
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
import { Card } from '@/components/Card';

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

  return (
    <div className="flex flex-col flex-1 bg-surface">
      {/* No AppHeader — this route is the one other unauthenticated page
          (src/proxy.ts doesn't match /shared/*), so it gets the same
          minimal chrome as the public landing page. */}
      <div className="flex w-full justify-end px-4 py-3 sm:px-8 print:hidden">
        <ThemeToggle />
      </div>
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-8 px-4 sm:py-16 sm:px-8"
      >
        {/* Cover header (ADR-0019 M10 C6): trip name, destinations, date
            range, and day count — every field here already comes from
            data.trip/data.days, exactly what getSharedTrip() (src/server/
            sharing.ts) returns after stripping userId/shareToken. Nothing
            added is owner-identifying: no email, no userId, no token. */}
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
          Read-only shared view
        </p>
        <div className="flex items-baseline justify-between gap-4 mb-2">
          <h1 className="text-4xl font-semibold text-foreground">
            {trip.name}
          </h1>
          {canSaveCopy && <DuplicateCopyForm token={token} />}
        </div>
        <p className="text-sm text-muted-fg mb-8">
          {trip.destinations.join(', ')}
          {trip.destinations.length > 0 && ' · '}
          <span className="font-mono tabular-nums">
            {formatDateRange(trip.startDate, trip.endDate)}
          </span>{' '}
          · <span className="font-mono tabular-nums">{days.length}</span>{' '}
          {days.length === 1 ? 'day' : 'days'}
        </p>

        <Card as="section" className="mb-10">
          <h2 className="text-lg font-medium text-foreground mb-2">Budget</h2>

          {/* Same departure-board treatment as BudgetPanel.tsx — this view
              is unauthenticated and read-only, but "read-only" doesn't mean
              a plainer visual language: the shared view gets the same
              tokens (they're already dark-aware here, unlike print). */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
            <span
              className={`inline-flex items-baseline rounded-full px-4 py-1.5 font-mono tabular-nums text-4xl font-semibold ${
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
          </div>

          <p
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
          </p>

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
        </Card>

        <div className="flex flex-col gap-8">
          {/* Read-only view: no pin selection, so no handler to pass — and a
              Server Component cannot pass one to a Client Component anyway. */}
          <Map pins={pins} selectedId={null} />

          {days.map((day) => (
            <section key={day.id}>
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
