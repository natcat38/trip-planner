import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import { ForbiddenOrNotFoundError, requireTrip } from '@/server/auth-scope';
import { ensureDaysForTrip } from '@/server/itinerary';
import {
  addActivityAction,
  deleteActivityAction,
  moveActivityAction,
} from './actions';
import { ActivityForm } from './ActivityForm';
import { BudgetPanel } from './BudgetPanel';

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export default async function TripItineraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let trip;
  let days;
  try {
    trip = await requireTrip(id);
    days = await ensureDaysForTrip(id);
  } catch (err) {
    if (err instanceof ForbiddenOrNotFoundError) {
      return (
        <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
          <p className="text-zinc-600 dark:text-zinc-400">{err.message}</p>
        </div>
      );
    }
    throw err;
  }

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <main className="flex-1 w-full max-w-3xl mx-auto py-16 px-8">
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            {trip.name}
          </h1>
          <Link
            href={`/trips/${trip.id}/edit`}
            className="text-sm text-zinc-600 dark:text-zinc-400 underline"
          >
            Edit trip
          </Link>
        </div>

        <BudgetPanel tripId={trip.id} />

        <div className="flex flex-col gap-8">
          {days.map((day) => (
            <section key={day.id}>
              <h2 className="font-medium text-black dark:text-zinc-50 mb-3">
                {formatDay(day.date)}
              </h2>

              {day.activities.length > 0 && (
                <ul className="flex flex-col gap-2 mb-4">
                  {day.activities.map((activity, index) => (
                    <li
                      key={activity.id}
                      className="flex items-start justify-between gap-4 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
                    >
                      <div>
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
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <form
                          action={moveActivityAction.bind(
                            null,
                            trip.id,
                            activity.id,
                            'up',
                          )}
                        >
                          <button
                            type="submit"
                            disabled={index === 0}
                            aria-label="Move up"
                            className="text-zinc-500 disabled:opacity-30 dark:text-zinc-400"
                          >
                            ↑
                          </button>
                        </form>
                        <form
                          action={moveActivityAction.bind(
                            null,
                            trip.id,
                            activity.id,
                            'down',
                          )}
                        >
                          <button
                            type="submit"
                            disabled={index === day.activities.length - 1}
                            aria-label="Move down"
                            className="text-zinc-500 disabled:opacity-30 dark:text-zinc-400"
                          >
                            ↓
                          </button>
                        </form>
                        <Link
                          href={`/trips/${trip.id}/activities/${activity.id}/edit`}
                          className="text-sm text-zinc-600 dark:text-zinc-400 underline"
                        >
                          Edit
                        </Link>
                        <form
                          action={deleteActivityAction.bind(
                            null,
                            trip.id,
                            activity.id,
                          )}
                        >
                          <button
                            type="submit"
                            className="text-sm text-red-600 dark:text-red-400 underline"
                          >
                            Delete
                          </button>
                        </form>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <details className="rounded-lg border border-dashed border-black/[.08] p-4 dark:border-white/[.145]">
                <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-50">
                  Add activity
                </summary>
                <div className="mt-4">
                  <ActivityForm
                    action={addActivityAction.bind(null, trip.id, day.id)}
                    submitLabel="Add activity"
                  />
                </div>
              </details>
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
