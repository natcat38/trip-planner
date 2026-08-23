'use client';

import { Fragment, Suspense, use, useState } from 'react';
import Link from 'next/link';
import { Map } from '@/components/Map';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { SubmitButton } from '@/components/SubmitButton';
import { formatMoney } from '@/lib/money';
import type { DayWeather } from '@/lib/research/weather';
import type { ensureDaysForTrip } from '@/server/itinerary';
import type { VoteSummary } from '@/server/votes';
import {
  addActivityAction,
  deleteActivityAction,
  moveActivityAction,
  setActivityPinColorAction,
  toggleVoteAction,
} from './actions';
import { ActivityForm } from './ActivityForm';
import { DayNotesForm } from './DayNotesForm';
import { TransitLeg } from './TransitLeg';

type Days = Awaited<ReturnType<typeof ensureDaysForTrip>>;

// A fixed palette is friendlier and safer than a free-text colour field —
// every value here is already a valid hex, so there's nothing for a picker
// built on it to get wrong. "Default" clears pinColor (submits null) rather
// than being one of these.
const PIN_COLOR_PALETTE = [
  '#dc2626', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#16a34a', // green
  '#2563eb', // blue
  '#9333ea', // purple
] as const;

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

// Matches the YYYY-MM-DD keys getTripWeather() returns — Day.date is UTC
// midnight, so slicing the ISO string is the same calendar day every time.
function dateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

// Degrade-honestly rule (ADR-0008, applied to weather): a historical reading
// must never read like a forecast. `kind` drives the label, not just a
// visual tweak — the sentence itself says "last year", every time.
function formatWeatherLine(weather: DayWeather): string {
  const temps = `${Math.round(weather.maxC)}°/${Math.round(weather.minC)}°C`;
  const rain =
    weather.precipitationChance != null
      ? `${weather.precipitationChance}% chance of rain`
      : weather.precipitationMm != null
        ? `${weather.precipitationMm}mm rain`
        : null;
  const parts = [weather.label, temps, rain].filter(Boolean);

  return weather.kind === 'historical'
    ? `Last year on this date: ${parts.join(' · ')}`
    : parts.join(' · ');
}

// A skeleton, not a spinner: the weather line is a single row of text, so a
// pulse block the same size as the real line avoids any layout shift when
// it resolves.
function WeatherLineSkeleton() {
  return (
    <span className="mb-3 block h-4 w-48 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
  );
}

// Reads the weather promise via `use()`, isolated in its own leaf component
// so only this line suspends — the rest of the day (title, activities) is
// plain props and renders immediately. `weatherPromise` is created once in
// the parent Server Component (trips/[id]/page.tsx) and passed down
// unawaited, which is what lets the itinerary stream in before
// geocode()+getTripWeather() resolve.
function DayWeatherLine({
  weatherPromise,
  dayKey,
}: {
  weatherPromise: Promise<Record<string, DayWeather> | null>;
  dayKey: string;
}) {
  const weather = use(weatherPromise);
  const dayWeather = weather?.[dayKey];
  if (!dayWeather) return null;

  return (
    <p
      className={`text-sm mb-3 ${
        dayWeather.kind === 'historical'
          ? 'italic text-zinc-500 dark:text-zinc-400'
          : 'text-zinc-600 dark:text-zinc-400'
      }`}
    >
      {formatWeatherLine(dayWeather)}
    </p>
  );
}

function WeatherAttribution({
  weatherPromise,
}: {
  weatherPromise: Promise<Record<string, DayWeather> | null>;
}) {
  const weather = use(weatherPromise);
  if (!weather || Object.keys(weather).length === 0) return null;

  return (
    <p className="text-xs text-zinc-500 dark:text-zinc-400">
      Weather data by{' '}
      <a
        href="https://open-meteo.com/"
        className="underline"
        target="_blank"
        rel="noopener noreferrer"
      >
        Open-Meteo
      </a>{' '}
      (CC BY 4.0)
    </p>
  );
}

export function ItineraryDays({
  tripId,
  days,
  weatherPromise,
  votes,
}: {
  tripId: string;
  days: Days;
  weatherPromise: Promise<Record<string, DayWeather> | null>;
  votes: Record<string, VoteSummary>;
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
      color: activity.pinColor,
    }));

  return (
    <div className="flex flex-col gap-8">
      <Map
        pins={pins}
        selectedId={selectedActivityId}
        onSelectPin={setSelectedActivityId}
      />

      {days.map((day) => {
        return (
          <section key={day.id}>
            <h2 className="font-medium text-black dark:text-zinc-50 mb-1">
              {formatDay(day.date)}
            </h2>
            <Suspense fallback={<WeatherLineSkeleton />}>
              <DayWeatherLine
                weatherPromise={weatherPromise}
                dayKey={dateKey(day.date)}
              />
            </Suspense>

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
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 rounded-lg border p-4 ${
                          activity.id === selectedActivityId
                            ? 'border-red-400 dark:border-red-500'
                            : 'border-black/[.08] dark:border-white/25'
                        }`}
                      >
                        <div className="flex-1 flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => setSelectedActivityId(activity.id)}
                            className="text-left"
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
                                activity.costMinor != null &&
                                activity.costCurrency
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

                          <div className="flex items-center gap-3">
                            <form
                              action={toggleVoteAction.bind(
                                null,
                                tripId,
                                activity.id,
                              )}
                            >
                              <SubmitButton
                                pendingLabel="Voting…"
                                aria-pressed={votes[activity.id]?.mine ?? false}
                                aria-label={`${votes[activity.id]?.count ?? 0} votes${votes[activity.id]?.mine ? ', you voted' : ''} — ${activity.title}`}
                                className={`flex items-center gap-1 rounded-full border px-2 py-1.5 text-xs ${
                                  votes[activity.id]?.mine
                                    ? 'border-blue-400 text-blue-600 dark:border-blue-500 dark:text-blue-400'
                                    : 'border-black/[.08] text-zinc-500 dark:border-white/25 dark:text-zinc-400'
                                }`}
                              >
                                <span aria-hidden>👍</span>{' '}
                                {votes[activity.id]?.count ?? 0}
                              </SubmitButton>
                            </form>

                            <details className="relative">
                              <summary className="cursor-pointer list-none">
                                <span
                                  aria-hidden
                                  className="inline-block h-6 w-6 rounded-full border border-black/[.08] align-middle dark:border-white/25"
                                  style={{
                                    background: activity.pinColor ?? '#2563eb',
                                  }}
                                />
                                <span className="sr-only">Pin colour</span>
                              </summary>
                              {/* bg-background resolves to #0a0a0a in dark mode,
                                  identical to the page's own dark:bg-black
                                  backdrop — the popover was invisible against
                                  itself without an explicit surface colour. */}
                              <div className="absolute z-10 mt-1 flex items-center gap-2 rounded-lg border border-black/[.08] bg-background p-2 shadow-sm dark:border-white/25 dark:bg-zinc-900">
                                {PIN_COLOR_PALETTE.map((color) => (
                                  <form
                                    key={color}
                                    action={setActivityPinColorAction.bind(
                                      null,
                                      tripId,
                                      activity.id,
                                      color,
                                    )}
                                  >
                                    <SubmitButton
                                      aria-label={`Set pin colour ${color}`}
                                      pendingLabel=""
                                      className={`h-6 w-6 rounded-full border ${
                                        activity.pinColor === color
                                          ? 'border-black dark:border-white'
                                          : 'border-black/[.08] dark:border-white/25'
                                      }`}
                                      style={{ background: color }}
                                    >
                                      {null}
                                    </SubmitButton>
                                  </form>
                                ))}
                                <form
                                  action={setActivityPinColorAction.bind(
                                    null,
                                    tripId,
                                    activity.id,
                                    null,
                                  )}
                                >
                                  <SubmitButton
                                    pendingLabel="Clearing…"
                                    className="text-xs text-zinc-500 underline dark:text-zinc-400"
                                  >
                                    Default
                                  </SubmitButton>
                                </form>
                              </div>
                            </details>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <form
                            action={moveActivityAction.bind(
                              null,
                              tripId,
                              activity.id,
                              'up',
                            )}
                          >
                            <SubmitButton
                              disabled={index === 0}
                              aria-label="Move up"
                              pendingLabel="…"
                              className="p-2 text-zinc-500 disabled:opacity-30 dark:text-zinc-400"
                            >
                              ↑
                            </SubmitButton>
                          </form>
                          <form
                            action={moveActivityAction.bind(
                              null,
                              tripId,
                              activity.id,
                              'down',
                            )}
                          >
                            <SubmitButton
                              disabled={index === day.activities.length - 1}
                              aria-label="Move down"
                              pendingLabel="…"
                              className="p-2 text-zinc-500 disabled:opacity-30 dark:text-zinc-400"
                            >
                              ↓
                            </SubmitButton>
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
                            <ConfirmSubmitButton
                              confirm="Delete this activity?"
                              pendingLabel="Deleting…"
                              className="text-sm text-red-600 dark:text-red-400 underline"
                            >
                              Delete
                            </ConfirmSubmitButton>
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

            <details className="rounded-lg border border-dashed border-black/[.08] p-4 dark:border-white/25">
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

            <DayNotesForm
              tripId={tripId}
              dayId={day.id}
              updatedAt={day.updatedAt.toISOString()}
              notes={day.notes}
            />
          </section>
        );
      })}

      {/* No loading fallback: this line is pure attribution, not content —
          nothing is lost by it simply appearing once weather resolves. */}
      <Suspense fallback={null}>
        <WeatherAttribution weatherPromise={weatherPromise} />
      </Suspense>
    </div>
  );
}
