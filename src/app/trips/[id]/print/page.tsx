/**
 * The print/export view: a light-mode-only (regardless of OS theme —
 * printed output should stay ink-friendly), nav-free rendering of a trip's
 * itinerary and budget summary, reached only via requireTripAccess.
 * @packageDocumentation
 */
import { Fragment } from 'react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import { formatDay, formatDateRange } from '@/lib/format';
import {
  ForbiddenOrNotFoundError,
  requireTripAccess,
} from '@/server/auth-scope';
import { getBudgetSummary } from '@/server/budget';
import { listExpenses } from '@/server/expenses';
import { ensureDaysForTrip } from '@/server/itinerary';
import { ExportButton } from './ExportButton';
import { budgetBannerText } from '../BudgetPanel';

// Static, print-safe mirror of BudgetPanel.tsx's CategoryShareBar. Same
// display-only percentage derivation (each category's share of
// summary.spentMinor, computed fresh on every render, never stored or fed
// back into any budget figure) — the only difference from the authenticated
// component is that the segment colour is the literal light-mode accent hex
// (#2563eb) instead of `var(--accent)`, so this route can't pick up the
// token's .dark override.
function BudgetCategoryShareBarStatic({
  byCategory,
  spentMinor,
  currency,
}: {
  byCategory: Record<string, number>;
  spentMinor: number;
  currency: string;
}) {
  const entries = Object.entries(byCategory);
  if (entries.length === 0 || spentMinor <= 0) return null;

  const OPACITIES = [1, 0.75, 0.55, 0.4, 0.25];
  const shares = entries.map(([category, minor], index) => ({
    category,
    minor,
    index,
    pct: (minor / spentMinor) * 100,
  }));

  return (
    <div className="mt-4">
      {/* Decorative: the legend below is the accessible version of this
          same information (label + % + amount, in the same order as the
          segments), so the bar itself is hidden from assistive tech rather
          than announced twice. */}
      <div
        aria-hidden="true"
        className="print-color-exact flex h-3 w-full overflow-hidden rounded-full border border-black/[.08]"
      >
        {shares.map((s) => (
          <div
            key={s.category}
            className="h-full border-r border-white last:border-r-0"
            style={{
              width: `${s.pct}%`,
              backgroundColor: `color-mix(in srgb, #2563eb ${Math.round(
                OPACITIES[s.index % OPACITIES.length] * 100,
              )}%, transparent)`,
            }}
          />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-sm text-zinc-600">
        {shares.map((s) => (
          <li key={s.category} className="contents">
            <span className="flex items-center gap-2 truncate">
              <span
                aria-hidden="true"
                className="print-color-exact h-2 w-2 shrink-0 rounded-full border border-black/[.08]"
                style={{
                  backgroundColor: `color-mix(in srgb, #2563eb ${Math.round(
                    OPACITIES[s.index % OPACITIES.length] * 100,
                  )}%, transparent)`,
                }}
              />
              {s.category}
            </span>
            <span className="font-mono tabular-nums text-right">
              {Math.round(s.pct)}%
            </span>
            <span className="font-mono tabular-nums text-right">
              {formatMoney(s.minor, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const trip = await requireTripAccess(id);
    return { title: `Print — ${trip.name} · Trip Planner` };
  } catch {
    return {};
  }
}

export default async function TripPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let trip;
  let days;
  let budget;
  let expenses;
  try {
    trip = await requireTripAccess(id);
    [days, budget, expenses] = await Promise.all([
      ensureDaysForTrip(id),
      getBudgetSummary(id),
      listExpenses(id),
    ]);
  } catch (err) {
    if (err instanceof ForbiddenOrNotFoundError) {
      return (
        <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50">
          <p className="text-zinc-600">{err.message}</p>
        </div>
      );
    }
    throw err;
  }

  return (
    <div className="flex flex-col flex-1 bg-white">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-16 px-8 print:py-0 print:px-0"
      >
        <div className="flex items-center justify-between mb-2 print:hidden">
          <Link
            href={`/trips/${trip.id}`}
            className="text-sm text-zinc-600 underline"
          >
            Back to trip
          </Link>
          <ExportButton />
        </div>

        <h1 className="print-running-title text-4xl font-semibold text-black mb-1">
          {trip.name}
        </h1>
        <p className="text-sm text-zinc-600 mb-8">
          {trip.destinations.join(', ')} ·{' '}
          <span className="font-mono tabular-nums">
            {formatDateRange(trip.startDate, trip.endDate)}
          </span>
        </p>

        <section className="mb-10 border-t border-b border-black/[.15] py-5 break-inside-avoid">
          <h2 className="text-lg font-medium text-black mb-2">Budget</h2>

          {/* Same departure-board treatment as BudgetPanel.tsx (big
              over/under figure, proportion bar, right-aligned tabular
              columns), reproduced statically and with print's own
              always-light literal colours — bg-danger/bg-positive/var(--accent)
              are NOT used here because they carry a .dark override, which
              would break "light regardless of viewer theme" the moment
              someone opens this route (not literally prints it) with the
              app's dark toggle on. #dc2626/#15803d/#2563eb below are the
              exact literal values --danger/--positive/--accent resolve to in
              light mode (Tailwind's red-600/green-700/blue-600). */}
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
            <span
              className={`print-color-exact inline-flex items-baseline rounded-full px-4 py-1.5 font-mono tabular-nums text-4xl font-semibold text-white ${
                budget.isOverBudget ? 'bg-red-600' : 'bg-green-700'
              }`}
            >
              {formatMoney(
                Math.abs(budget.remainingMinor),
                budget.baseCurrency,
              )}
            </span>
            <span className="text-sm text-zinc-600">
              {budget.isOverBudget ? 'over budget' : 'remaining'}
            </span>
          </div>

          <p
            className={
              budget.isOverBudget
                ? 'text-red-600 text-sm'
                : 'text-zinc-700 text-sm'
            }
          >
            {budgetBannerText(
              budget.spentMinor,
              budget.budgetMinor,
              budget.baseCurrency,
            )}
          </p>

          {Object.keys(budget.byCategory).length > 0 && (
            <BudgetCategoryShareBarStatic
              byCategory={budget.byCategory}
              spentMinor={budget.spentMinor}
              currency={budget.baseCurrency}
            />
          )}
          {budget.unconvertedItems.length > 0 && (
            <div className="print-color-exact mt-4 rounded-lg bg-amber-700 p-3">
              <ul className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm text-white">
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
            <ul className="mt-4 grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm text-zinc-600">
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
        </section>

        <div className="flex flex-col gap-8">
          {days.map((day) => (
            <section key={day.id} className="break-inside-avoid">
              <h2 className="print:break-after-avoid text-lg font-medium text-black mb-3 border-b border-black/[.15] pb-1 font-mono tabular-nums">
                {formatDay(day.date)}
              </h2>
              {day.activities.length > 0 ? (
                <ul className="flex flex-col divide-y divide-black/[.15]">
                  {day.activities.map((activity) => (
                    <li key={activity.id} className="py-3 first:pt-0">
                      <p className="font-medium text-black">
                        {activity.title}{' '}
                        <span className="font-normal text-zinc-500">
                          ({activity.category})
                        </span>
                      </p>
                      <p className="text-sm text-zinc-600">
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
                        <p className="text-sm text-zinc-500 mt-1">
                          {activity.notes}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">No activities planned.</p>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
