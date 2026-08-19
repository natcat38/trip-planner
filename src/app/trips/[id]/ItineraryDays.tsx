'use client';

import { Fragment, useState } from 'react';
import Link from 'next/link';
import { Map } from '@/components/Map';
import { formatMoney } from '@/lib/money';
import type { ensureDaysForTrip } from '@/server/itinerary';
import {
  addActivityAction,
  deleteActivityAction,
  moveActivityAction,
} from './actions';
import { ActivityForm } from './ActivityForm';
import { TransitLeg } from './TransitLeg';

type Days = Awaited<ReturnType<typeof ensureDaysForTrip>>;

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

export function ItineraryDays({
  tripId,
  days,
}: {
  tripId: string;
  days: Days;
}) {
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    null,
  );

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
    <div className="flex flex-col gap-8">
      <Map
        pins={pins}
        selectedId={selectedActivityId}
        onSelectPin={setSelectedActivityId}
      />

      {days.map((day) => (
        <section key={day.id}>
          <h2 className="font-medium text-black dark:text-zinc-50 mb-3">
            {formatDay(day.date)}
          </h2>

          {day.activities.length > 0 && (
            <ul className="flex flex-col gap-2 mb-4">
              {day.activities.map((activity, index) => {
                const nextActivity = day.activities[index + 1];
                const showTransitLeg =
                  nextActivity != null &&
                  activity.lat != null &&
                  activity.lng != null &&
                  nextActivity.lat != null &&
                  nextActivity.lng != null;

                return (
                  <Fragment key={activity.id}>
                    <li
                      className={`flex items-start justify-between gap-4 rounded-lg border p-4 ${
                        activity.id === selectedActivityId
                          ? 'border-red-400 dark:border-red-500'
                          : 'border-black/[.08] dark:border-white/[.145]'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedActivityId(activity.id)}
                        className="flex-1 text-left"
                        disabled={activity.lat == null}
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
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <form
                          action={moveActivityAction.bind(
                            null,
                            tripId,
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
                            tripId,
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
                          href={`/trips/${tripId}/activities/${activity.id}/edit`}
                          className="text-sm text-zinc-600 dark:text-zinc-400 underline"
                        >
                          Edit
                        </Link>
                        <form
                          action={deleteActivityAction.bind(
                            null,
                            tripId,
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
                    {showTransitLeg && (
                      // Keyed on BOTH endpoints so reordering or deleting an
                      // activity remounts this leg. Without it React keeps the
                      // component (the Fragment's key and the position are
                      // unchanged) and useActionState holds the journeys
                      // fetched for the previous destination — a real route,
                      // shown against the wrong leg.
                      <TransitLeg
                        key={`${activity.id}-${nextActivity.id}`}
                        tripId={tripId}
                        from={{
                          activityId: activity.id,
                          lat: activity.lat!,
                          lng: activity.lng!,
                        }}
                        to={{
                          activityId: nextActivity.id,
                          lat: nextActivity.lat!,
                          lng: nextActivity.lng!,
                        }}
                        toLabel={nextActivity.title}
                      />
                    )}
                  </Fragment>
                );
              })}
            </ul>
          )}

          <details className="rounded-lg border border-dashed border-black/[.08] p-4 dark:border-white/[.145]">
            <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-50">
              Add activity
            </summary>
            <div className="mt-4">
              <ActivityForm
                action={addActivityAction.bind(null, tripId, day.id)}
                submitLabel="Add activity"
              />
            </div>
          </details>
        </section>
      ))}
    </div>
  );
}
