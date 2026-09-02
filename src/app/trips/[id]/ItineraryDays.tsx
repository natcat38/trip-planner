import { Fragment, Suspense, use } from 'react';
import Link from 'next/link';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { SubmitButton } from '@/components/SubmitButton';
import { formatMoney } from '@/lib/money';
import { daySubtotals } from '@/lib/dayRail';
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
import {
  ActivityRowFrame,
  ActivitySelectButton,
  SelectedMap,
  SelectionProvider,
} from './ItinerarySelection';
import {
  DayTimingProvider,
  NextBadge,
  TodayBadge,
  TodayDot,
} from './DayTiming';

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

// Human names for the swatch aria-labels (#13) — a hex value read aloud by a
// screen reader ("pound d c two six two six") is meaningless; the palette is
// fixed (see above), so a lookup is safe and exhaustive.
const PIN_COLOR_NAMES: Record<(typeof PIN_COLOR_PALETTE)[number], string> = {
  '#dc2626': 'red',
  '#f97316': 'orange',
  '#eab308': 'yellow',
  '#16a34a': 'green',
  '#2563eb': 'blue',
  '#9333ea': 'purple',
};

// This is a Server Component (rendered once, server-side), so — unlike the
// old 'use client' version of this file — there is no hydration-mismatch
// risk from locale resolution here; `undefined` would be safe. Left
// hardcoded to 'en-US'/UTC anyway to keep this file's date/weather output
// byte-identical to before the split.
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

function ThumbIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 20 20"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M6.5 9v8H4a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1h2.5Zm0 0 3.24-5.98a1.4 1.4 0 0 1 2.55 1.06L11.3 9h3.44a1.7 1.7 0 0 1 1.67 2.02l-1.08 5.6A1.7 1.7 0 0 1 13.66 18H9a2.5 2.5 0 0 1-2.5-2.5" />
    </svg>
  );
}

function ChevronIcon({ direction }: { direction: 'up' | 'down' }) {
  return (
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
    >
      <path
        d={
          direction === 'up'
            ? 'M5 12.5 10 7.5 15 12.5'
            : 'M5 7.5 10 12.5 15 7.5'
        }
      />
    </svg>
  );
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
    <span className="mb-3 block h-4 w-48 animate-pulse rounded bg-border" />
  );
}

// Reads the weather promise via `use()`, isolated in its own leaf component
// so only this line suspends — the rest of the day (title, activities) is
// plain props and renders immediately. `weatherPromise` is created once in
// the parent Server Component (trips/[id]/page.tsx) and passed down
// unawaited, which is what lets the itinerary stream in before
// geocode()+getTripWeather() resolve. `use()` works the same way in a
// Server Component as it did in the old client component — this leaf still
// suspends independently of the rest of the tree.
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
        Open-Meteo<span className="sr-only"> (opens in new tab)</span>
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
    // Two-pane at lg: `order-first`/`order-last` reorder the map without
    // moving it in the DOM (the itinerary — the day rail — stays document
    // order-first so the streamed content the Suspense boundaries below
    // guard is unaffected by this class-only reordering). Below lg it's a
    // single flex-col column, map above days, unchanged from before this
    // task. `min-w-0` on the rail keeps a long activity/place name from
    // forcing the flex item wider than the pane (the same guard B11 added
    // elsewhere for this reason).
    //
    // SelectionProvider is the one client boundary shared by the Map and
    // the day rail below (selectedActivityId, ADR-0019 §2) — everything
    // else in this tree is server-rendered.
    <SelectionProvider>
      <div className="flex flex-col gap-8 lg:flex-row lg:items-start">
        <div className="order-first lg:order-last lg:sticky lg:top-8 lg:w-[26rem] lg:shrink-0">
          <SelectedMap pins={pins} />
        </div>

        {/* The day rail: a vertical "station stop" timeline. The connecting
            line is one absolutely-positioned element spanning the whole list
            (not per-day), so it reads as a continuous route line behind each
            day's stop marker. */}
        <div className="relative min-w-0 flex-1">
          <div
            aria-hidden
            className="absolute left-[7px] top-2 bottom-2 w-px bg-border"
          />
          <div className="flex flex-col gap-8">
            {days.map((day) => {
              const subtotals = daySubtotals(day.activities);

              return (
                <DayTimingProvider
                  key={day.id}
                  date={day.date}
                  activities={day.activities}
                >
                  <section className="relative pl-8">
                    <TodayDot />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border pb-2 mb-1">
                      <h2 className="text-lg font-medium text-foreground font-mono tabular-nums">
                        {formatDay(day.date)}
                        <TodayBadge />
                      </h2>
                      <div className="flex items-center gap-3 text-xs font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                        <span>
                          {day.activities.length}{' '}
                          {day.activities.length === 1
                            ? 'activity'
                            : 'activities'}
                        </span>
                        {subtotals.length > 0 && (
                          <span>
                            {subtotals
                              .map(({ currency, minor }) =>
                                formatMoney(minor, currency),
                              )
                              .join(' + ')}
                          </span>
                        )}
                      </div>
                    </div>
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
                              <ActivityRowFrame activityId={activity.id}>
                                <div className="flex-1 min-w-0 flex flex-col gap-2">
                                  <ActivitySelectButton
                                    activityId={activity.id}
                                    disabled={activity.lat == null}
                                  >
                                    <p className="font-medium text-foreground truncate">
                                      {activity.title}{' '}
                                      <span className="font-normal text-zinc-500 dark:text-zinc-400">
                                        ({activity.category})
                                      </span>
                                      <NextBadge activityId={activity.id} />
                                    </p>
                                    <p className="text-sm text-zinc-600 dark:text-zinc-400">
                                      {[
                                        activity.startTime &&
                                        activity.endTime ? (
                                          <span
                                            key="time"
                                            className="font-mono tabular-nums"
                                          >
                                            {activity.startTime}–
                                            {activity.endTime}
                                          </span>
                                        ) : activity.startTime ? (
                                          <span
                                            key="time"
                                            className="font-mono tabular-nums"
                                          >
                                            {activity.startTime}
                                          </span>
                                        ) : null,
                                        activity.placeName,
                                        activity.costMinor != null &&
                                        activity.costCurrency ? (
                                          <span
                                            key="cost"
                                            className="font-mono tabular-nums"
                                          >
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
                                  </ActivitySelectButton>

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
                                        aria-pressed={
                                          votes[activity.id]?.mine ?? false
                                        }
                                        aria-label={`${votes[activity.id]?.count ?? 0} votes${votes[activity.id]?.mine ? ', you voted' : ''} — ${activity.title}`}
                                        className={`flex items-center gap-1 rounded-full border px-2 py-1.5 text-xs ${
                                          votes[activity.id]?.mine
                                            ? 'border-accent bg-accent text-accent-fg dark:border-accent dark:bg-accent dark:text-accent-fg'
                                            : 'border-border text-zinc-500 dark:text-zinc-400'
                                        }`}
                                      >
                                        <ThumbIcon />
                                        {votes[activity.id]?.count ?? 0}
                                      </SubmitButton>
                                    </form>

                                    <details className="relative">
                                      <summary className="flex cursor-pointer list-none items-center gap-1">
                                        <span
                                          aria-hidden
                                          className="inline-block h-6 w-6 rounded-full border border-border align-middle"
                                          style={{
                                            // ADR-0019 §2: the unset-pin fallback
                                            // converges on the accent token instead
                                            // of its own #2563eb literal.
                                            background:
                                              activity.pinColor ??
                                              'var(--accent)',
                                          }}
                                        />
                                        <ChevronIcon direction="down" />
                                        <span className="sr-only">
                                          Pin colour
                                        </span>
                                      </summary>
                                      <div className="absolute z-10 mt-1 flex items-center gap-2 rounded-lg border border-border bg-surface-raised p-2 shadow-sm">
                                        {PIN_COLOR_PALETTE.map((color) => (
                                          <form
                                            key={color}
                                            action={setActivityPinColorAction.bind(
                                              null,
                                              tripId,
                                              activity.id,
                                              color,
                                              activity.updatedAt.toISOString(),
                                            )}
                                          >
                                            <SubmitButton
                                              aria-label={`Set pin colour ${PIN_COLOR_NAMES[color]}`}
                                              className={`h-6 w-6 rounded-full border ${
                                                activity.pinColor === color
                                                  ? 'border-accent'
                                                  : 'border-border'
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
                                            activity.updatedAt.toISOString(),
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
                                      <ChevronIcon direction="up" />
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
                                      disabled={
                                        index === day.activities.length - 1
                                      }
                                      aria-label="Move down"
                                      pendingLabel="…"
                                      className="p-2 text-zinc-500 disabled:opacity-30 dark:text-zinc-400"
                                    >
                                      <ChevronIcon direction="down" />
                                    </SubmitButton>
                                  </form>
                                  <Link
                                    href={`/trips/${tripId}/activities/${activity.id}/edit`}
                                    className="text-sm text-zinc-600 dark:text-zinc-400 underline"
                                  >
                                    Edit
                                  </Link>
                                  {/* #6: a visible divider plus extra left margin
                                      separates Delete from Edit/Move so a mis-tap
                                      on mobile can't land on the destructive
                                      action. */}
                                  <form
                                    action={deleteActivityAction.bind(
                                      null,
                                      tripId,
                                      activity.id,
                                    )}
                                    className="ml-2 border-l border-border pl-3"
                                  >
                                    <ConfirmSubmitButton
                                      confirm="Delete this activity?"
                                      pendingLabel="Deleting…"
                                      className="text-sm text-danger underline"
                                    >
                                      Delete
                                    </ConfirmSubmitButton>
                                  </form>
                                </div>
                              </ActivityRowFrame>
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

                    <details className="rounded-lg border border-dashed border-border p-4">
                      <summary className="cursor-pointer text-sm font-medium text-foreground">
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
                </DayTimingProvider>
              );
            })}
          </div>

          {/* No loading fallback: this line is pure attribution, not content —
              nothing is lost by it simply appearing once weather resolves. */}
          <Suspense fallback={null}>
            <WeatherAttribution weatherPromise={weatherPromise} />
          </Suspense>
        </div>
      </div>
    </SelectionProvider>
  );
}
