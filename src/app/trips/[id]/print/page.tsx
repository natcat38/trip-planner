/**
 * The print/export view: a light-mode-only (regardless of OS theme —
 * printed output should stay ink-friendly), nav-free rendering of a trip's
 * itinerary and budget summary, reached only via requireTripAccess.
 * @packageDocumentation
 */
import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import {
  ForbiddenOrNotFoundError,
  requireTripAccess,
} from '@/server/auth-scope';
import { getBudgetSummary } from '@/server/budget';
import { listExpenses } from '@/server/expenses';
import { ensureDaysForTrip } from '@/server/itinerary';
import { ExportButton } from './ExportButton';
import { budgetBannerText } from '../BudgetPanel';

function formatDay(date: Date): string {
  // Day.date is always stored as UTC midnight — pin the format to UTC so it
  // reads the same calendar day everywhere, regardless of viewer/server TZ.
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
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
      <main className="flex-1 w-full max-w-3xl mx-auto py-16 px-8 print:py-0 print:px-0">
        <div className="flex items-center justify-between mb-2 print:hidden">
          <Link
            href={`/trips/${trip.id}`}
            className="text-sm text-zinc-600 underline"
          >
            Back to trip
          </Link>
          <ExportButton />
        </div>

        <h1 className="text-2xl font-semibold text-black mb-1">{trip.name}</h1>
        <p className="text-sm text-zinc-600 mb-8">
          {trip.destinations.join(', ')} ·{' '}
          {formatDateRange(trip.startDate, trip.endDate)}
        </p>

        <section className="mb-10 border border-black/[.08] rounded-lg p-5 break-inside-avoid">
          <h2 className="font-medium text-black mb-2">Budget</h2>
          <p className={budget.isOverBudget ? 'text-red-600' : 'text-zinc-700'}>
            {budgetBannerText(
              budget.spentMinor,
              budget.budgetMinor,
              budget.baseCurrency,
            )}
          </p>
          {budget.unconvertedItems.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-sm text-amber-600">
              {budget.unconvertedItems.map((item) => (
                <li key={item.id}>
                  {item.label}:{' '}
                  {formatMoney(item.originalMinor, item.originalCurrency)} —
                  Showing original amount — conversion rate unavailable.
                </li>
              ))}
            </ul>
          )}
          {Object.keys(budget.byCategory).length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-sm text-zinc-600">
              {Object.entries(budget.byCategory).map(([category, minor]) => (
                <li key={category} className="flex justify-between">
                  <span>{category}</span>
                  <span>{formatMoney(minor, budget.baseCurrency)}</span>
                </li>
              ))}
            </ul>
          )}
          {expenses.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-sm text-zinc-600">
              {expenses.map((expense) => (
                <li key={expense.id} className="flex justify-between">
                  <span>
                    {expense.label} ({expense.category})
                  </span>
                  <span>
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
              <h2 className="font-medium text-black mb-3">
                {formatDay(day.date)}
              </h2>
              {day.activities.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {day.activities.map((activity) => (
                    <li
                      key={activity.id}
                      className="border border-black/[.08] rounded-lg p-4"
                    >
                      <p className="font-medium text-black">
                        {activity.title}{' '}
                        <span className="font-normal text-zinc-500">
                          ({activity.category})
                        </span>
                      </p>
                      <p className="text-sm text-zinc-600">
                        {[
                          activity.startTime && activity.endTime
                            ? `${activity.startTime}–${activity.endTime}`
                            : activity.startTime,
                          activity.placeName,
                          activity.costMinor != null && activity.costCurrency
                            ? formatMoney(
                                activity.costMinor,
                                activity.costCurrency,
                              )
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
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
