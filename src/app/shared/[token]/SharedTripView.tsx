import { Map } from '@/components/Map';
import { SubmitButton } from '@/components/SubmitButton';
import { formatMoney } from '@/lib/money';
import type {
  getSharedBudgetSummary,
  getSharedTrip,
  listSharedExpenses,
} from '@/server/sharing';
import { budgetBannerText } from '@/app/trips/[id]/BudgetPanel';
import { duplicateSharedTripAction } from './actions';

type SharedTripData = Awaited<ReturnType<typeof getSharedTrip>>;
type BudgetSummary = Awaited<ReturnType<typeof getSharedBudgetSummary>>;
type SharedExpenses = Awaited<ReturnType<typeof listSharedExpenses>>;

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
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <main className="flex-1 w-full max-w-3xl mx-auto py-16 px-8">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
          Read-only shared view
        </p>
        <div className="flex items-baseline justify-between gap-4 mb-8">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            {trip.name}
          </h1>
          {canSaveCopy && (
            <form action={duplicateSharedTripAction.bind(null, token)}>
              <SubmitButton
                pendingLabel="Saving…"
                className="shrink-0 rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Save a copy
              </SubmitButton>
            </form>
          )}
        </div>

        <section className="mb-10 rounded-lg border border-black/[.08] p-5 dark:border-white/25">
          <h2 className="font-medium text-black dark:text-zinc-50 mb-2">
            Budget
          </h2>
          <p
            className={
              budget.isOverBudget
                ? 'text-red-600 dark:text-red-400'
                : 'text-zinc-700 dark:text-zinc-300'
            }
          >
            {budgetBannerText(
              budget.spentMinor,
              budget.budgetMinor,
              budget.baseCurrency,
            )}
          </p>
          {budget.unconvertedItems.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-sm text-amber-700 dark:text-amber-400">
              {budget.unconvertedItems.map((item) => (
                <li key={item.id}>
                  {item.label}:{' '}
                  {formatMoney(item.originalMinor, item.originalCurrency)} —
                  Showing original amount — conversion rate unavailable.
                </li>
              ))}
            </ul>
          )}
          {expenses.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
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
          {/* Read-only view: no pin selection, so no handler to pass — and a
              Server Component cannot pass one to a Client Component anyway. */}
          <Map pins={pins} selectedId={null} />

          {days.map((day) => (
            <section key={day.id}>
              <h2 className="font-medium text-black dark:text-zinc-50 mb-3">
                {formatDay(day.date)}
              </h2>
              {day.activities.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {day.activities.map((activity) => (
                    <li
                      key={activity.id}
                      className="rounded-lg border border-black/[.08] p-4 dark:border-white/25"
                    >
                      <p className="font-medium text-black dark:text-zinc-50">
                        {activity.title}{' '}
                        <span className="font-normal text-zinc-500 dark:text-zinc-400">
                          ({activity.category})
                        </span>
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
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
