import { Map } from '@/components/Map';
import { formatMoney } from '@/lib/money';
import type { getSharedBudgetSummary, getSharedTrip } from '@/server/sharing';

type SharedTripData = Awaited<ReturnType<typeof getSharedTrip>>;
type BudgetSummary = Awaited<ReturnType<typeof getSharedBudgetSummary>>;

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function SharedTripView({
  data,
  budget,
}: {
  data: SharedTripData;
  budget: BudgetSummary;
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
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-8">
          {trip.name}
        </h1>

        <section className="mb-10 rounded-lg border border-black/[.08] p-5 dark:border-white/[.145]">
          <h2 className="font-medium text-black dark:text-zinc-50 mb-2">
            Budget
          </h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            {formatMoney(budget.spentMinor, budget.baseCurrency)} of{' '}
            {formatMoney(budget.budgetMinor, budget.baseCurrency)} planned
          </p>
        </section>

        <div className="flex flex-col gap-8">
          <Map pins={pins} selectedId={null} onSelectPin={() => {}} />

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
                      className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
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
                            ? formatMoney(activity.costMinor, activity.costCurrency)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
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
