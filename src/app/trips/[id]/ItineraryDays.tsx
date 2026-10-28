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
import { ActivityRowFrame, ActivitySelectButton } from './ItinerarySelection';
import { RowMenu } from './RowMenu';
import { DayControls } from './DayControls';
import {
  DayTimingProvider,
  NextBadge,
  NowProvider,
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
          : 'text-muted-fg'
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

// Menu item look, shared by the buttons, links and forms inside a row's
// "more actions" menu. 44px tall on a phone, 36px from sm.
const MENU_ITEM =
  'flex min-h-11 w-full items-center rounded px-3 text-left text-sm text-foreground hover:bg-surface disabled:opacity-40 sm:min-h-9';

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
  return (
    // The day rail: a vertical "station stop" timeline. The connecting line
    // is one absolutely-positioned element spanning the whole list (not
    // per-day), so it reads as a continuous route line behind each day's
    // stop marker. The map beside it, and the selection state the two
    // share, live in trips/[id]/page.tsx's TripLayout. `min-w-0` keeps a
    // long activity/place name from forcing the column wider than its pane.
    <div className="relative min-w-0">
      <div
        aria-hidden
        className="absolute left-[7px] top-2 bottom-2 w-px bg-border"
      />
      <div className="flex flex-col gap-8">
        <NowProvider>
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
                  {/* now/next (NowProvider/DayTimingProvider/TodayBadge/
                      NextBadge above) is scoped to this authenticated view
                      only, pending ADR-0019 open question 3 — print and the
                      public share view intentionally don't get the badges
                      (design-critique.md finding #3). */}
                  <DayControls
                    heading={
                      <h2 className="text-lg font-medium text-foreground font-mono tabular-nums">
                        {formatDay(day.date)}
                        <TodayBadge />
                      </h2>
                    }
                    stats={
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs font-mono tabular-nums text-muted-fg">
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
                    }
                    notes={day.notes}
                    activityCount={day.activities.length}
                    addForm={
                      <ActivityForm
                        action={addActivityAction.bind(null, tripId, day.id)}
                        submitLabel="Add activity"
                      />
                    }
                    notesForm={
                      <DayNotesForm
                        tripId={tripId}
                        dayId={day.id}
                        updatedAt={day.updatedAt.toISOString()}
                        notes={day.notes}
                      />
                    }
                  />
                  <Suspense fallback={<WeatherLineSkeleton />}>
                    <DayWeatherLine
                      weatherPromise={weatherPromise}
                      dayKey={dateKey(day.date)}
                    />
                  </Suspense>

                  {day.activities.length > 0 && (
                    <ul className="flex flex-col gap-2">
                      {day.activities.map((activity, index) => {
                        const nextActivity = day.activities[index + 1];
                        const showTransitLeg =
                          nextActivity != null &&
                          activity.lat != null &&
                          activity.lng != null &&
                          nextActivity.lat != null &&
                          nextActivity.lng != null;
                        const votesFor = votes[activity.id];

                        return (
                          <Fragment key={activity.id}>
                            <ActivityRowFrame activityId={activity.id}>
                              <div className="min-w-0 flex-1">
                                <ActivitySelectButton
                                  activityId={activity.id}
                                  disabled={activity.lat == null}
                                >
                                  {/* Departure-board columns (ADR-0019
                                      §4, design-critique.md finding #1):
                                      time in its own tabular-numeral
                                      column, title/category/place/notes in
                                      the middle, cost right-aligned —
                                      matches BudgetPanel.tsx's
                                      grid-cols-[1fr_auto_auto] pattern. */}
                                  {/* TRIP-UX-12: below sm the cost drops under the time
                                      (column 1, row 2) so the title column gets
                                      the full remaining width; from sm up it is
                                      the right-hand column again. */}
                                  <div className="grid grid-cols-[auto_1fr] gap-x-3 sm:grid-cols-[auto_1fr_auto]">
                                    <span className="col-start-1 row-start-1 font-mono tabular-nums text-sm text-muted-fg">
                                      {activity.startTime && activity.endTime
                                        ? `${activity.startTime}–${activity.endTime}`
                                        : (activity.startTime ?? '')}
                                    </span>
                                    <div className="col-start-2 row-span-2 row-start-1 min-w-0 sm:row-span-1">
                                      {/* TRIP-UX-12: two lines instead of one truncated line,
                                          with the full title on hover, so
                                          "Kushida Shrine and the Hakata old
                                          tow..." can be read. */}
                                      <p
                                        title={activity.title}
                                        className="font-medium text-foreground line-clamp-2 break-words"
                                      >
                                        {/* TRIP-UX-10: the pin colour no longer has a
                                            swatch control on every row; a dot shows it
                                            only where one was chosen. */}
                                        {activity.pinColor && (
                                          <span
                                            aria-hidden
                                            className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                                            style={{
                                              background: activity.pinColor,
                                            }}
                                          />
                                        )}
                                        {activity.title}{' '}
                                        <span className="font-normal text-muted-fg">
                                          ({activity.category})
                                        </span>
                                        <NextBadge activityId={activity.id} />
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
                                    <span className="col-start-1 row-start-2 font-mono tabular-nums text-sm text-muted-fg sm:col-start-3 sm:row-start-1 sm:text-right">
                                      {activity.costMinor != null &&
                                      activity.costCurrency
                                        ? formatMoney(
                                            activity.costMinor,
                                            activity.costCurrency,
                                          )
                                        : ''}
                                    </span>
                                  </div>
                                </ActivitySelectButton>
                              </div>

                              {/* TRIP-UX-10: a row used to carry a vote button, a
                                  swatch picker, two arrows, Edit and Delete (about
                                  114px, two lines on a phone). Now it carries the
                                  vote, which is the collaborative signal, and one
                                  "more actions" button; the rest is inside it. */}
                              <div className="flex shrink-0 items-center gap-1">
                                <form
                                  action={toggleVoteAction.bind(
                                    null,
                                    tripId,
                                    activity.id,
                                  )}
                                >
                                  <SubmitButton
                                    pendingLabel="Voting…"
                                    aria-pressed={votesFor?.mine ?? false}
                                    aria-label={`${votesFor?.count ?? 0} votes${votesFor?.mine ? ', you voted' : ''} — ${activity.title}`}
                                    className={`touch-target flex items-center gap-1 rounded-full border px-2 py-1.5 text-xs ${
                                      votesFor?.mine
                                        ? 'border-accent bg-accent text-accent-fg dark:border-accent dark:bg-accent dark:text-accent-fg'
                                        : 'border-border text-zinc-500 dark:text-zinc-400'
                                    }`}
                                  >
                                    <ThumbIcon />
                                    {votesFor?.count ?? 0}
                                  </SubmitButton>
                                </form>

                                <RowMenu
                                  label={`More actions — ${activity.title}`}
                                >
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
                                      aria-label={`Move ${activity.title} up`}
                                      pendingLabel="Moving…"
                                      doneMessage="Moved up"
                                      className={MENU_ITEM}
                                    >
                                      Move up
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
                                      aria-label={`Move ${activity.title} down`}
                                      pendingLabel="Moving…"
                                      doneMessage="Moved down"
                                      className={MENU_ITEM}
                                    >
                                      Move down
                                    </SubmitButton>
                                  </form>
                                  <Link
                                    href={`/trips/${tripId}/activities/${activity.id}/edit`}
                                    className={MENU_ITEM}
                                  >
                                    Edit
                                  </Link>
                                  <div
                                    role="group"
                                    aria-label="Pin colour"
                                    className="px-3 py-2"
                                  >
                                    <p
                                      aria-hidden="true"
                                      className="mb-1.5 text-xs text-muted-fg"
                                    >
                                      Pin colour
                                    </p>
                                    <div className="flex flex-wrap items-center gap-2">
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
                                            className={`h-8 w-8 rounded-full border-2 ${
                                              activity.pinColor === color
                                                ? 'border-foreground'
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
                                          className="min-h-8 px-1 text-xs text-muted-fg underline"
                                        >
                                          Default
                                        </SubmitButton>
                                      </form>
                                    </div>
                                  </div>
                                  {/* #6: a divider separates the destructive item
                                      from the rest so a mis-tap can't land on it. */}
                                  <form
                                    action={deleteActivityAction.bind(
                                      null,
                                      tripId,
                                      activity.id,
                                    )}
                                    className="mt-1 border-t border-border pt-1"
                                  >
                                    <ConfirmSubmitButton
                                      confirm="Delete this activity?"
                                      pendingLabel="Deleting…"
                                      doneMessage="Activity deleted"
                                      className={`${MENU_ITEM} text-danger`}
                                    >
                                      Delete
                                    </ConfirmSubmitButton>
                                  </form>
                                </RowMenu>
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
                </section>
              </DayTimingProvider>
            );
          })}
        </NowProvider>
      </div>

      {/* No loading fallback: this line is pure attribution, not content —
          nothing is lost by it simply appearing once weather resolves. */}
      <Suspense fallback={null}>
        <WeatherAttribution weatherPromise={weatherPromise} />
      </Suspense>
    </div>
  );
}
