import { Fragment } from 'react';
import { Map } from '@/components/Map';
import { SubmitButton } from '@/components/SubmitButton';
import { formatMoney } from '@/lib/money';
import { formatDay } from '@/lib/format';
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
import { duplicateSharedTripAction } from './actions';
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
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
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
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
          Read-only shared view
        </p>
        <div className="flex items-baseline justify-between gap-4 mb-8">
          <h1 className="text-4xl font-semibold text-black dark:text-zinc-50">
            {trip.name}
          </h1>
          {canSaveCopy && (
            <form action={duplicateSharedTripAction.bind(null, token)}>
              <SubmitButton
                pendingLabel="Saving…"
                className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
              >
                Save a copy
              </SubmitButton>
            </form>
          )}
        </div>

        <Card as="section" className="mb-10">
          <h2 className="text-lg font-medium text-black dark:text-zinc-50 mb-2">
            Budget
          </h2>

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
            <span className="text-sm text-zinc-600 dark:text-zinc-400">
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
            <ul className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
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
              <h2 className="text-lg font-medium text-black dark:text-zinc-50 mb-3 font-mono tabular-nums">
                {formatDay(day.date)}
              </h2>
              {day.activities.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {day.activities.map((activity) => (
                    <li
                      key={activity.id}
                      className="rounded-lg border border-border p-4"
                    >
                      <p className="font-medium text-black dark:text-zinc-50">
                        {activity.title}{' '}
                        <span className="font-normal text-zinc-500 dark:text-zinc-400">
                          ({activity.category})
                        </span>
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {[
                          activity.startTime && activity.endTime ? (
                            <span key="time" className="font-mono tabular-nums">
                              {activity.startTime}–{activity.endTime}
                            </span>
                          ) : activity.startTime ? (
                            <span key="time" className="font-mono tabular-nums">
                              {activity.startTime}
                            </span>
                          ) : null,
                          activity.placeName,
                          activity.costMinor != null &&
                          activity.costCurrency ? (
                            <span key="cost" className="font-mono tabular-nums">
                              {formatMoney(
                                activity.costMinor,
                                activity.costCurrency,
                              )}
                            </span>
                          ) : null,
                        ]
                          .filter(Boolean)
                          .map((seg, i) => (
                            <Fragment key={i}>
                              {i > 0 && ' · '}
                              {seg}
                            </Fragment>
                          ))}
                      </p>
                      {activity.notes && (
                        <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">
                          {activity.notes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
