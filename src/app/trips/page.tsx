/**
 * The trips list route: the signed-in user's trips overview and create/edit
 * entry points (`new/`, `[id]/edit/`) for the Trip aggregate itself.
 * @packageDocumentation
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { formatMoney } from '@/lib/money';
import { formatDateRange } from '@/lib/format';
import { listTrips } from '@/server/trips';
import { listPendingInvites } from '@/server/sharing';
import { InvitesBanner } from './InvitesBanner';
import { duplicateTripAction } from './actions';

// Departure status for the trip card badge. Trip.startDate/endDate are
// stored as UTC-midnight calendar days (same convention formatDay/
// formatDateRange already pin to), so this compares UTC calendar days, not
// browser-local ones — deterministic from the two dates and the server's
// current instant alone. Computed here, in a Server Component, and rendered
// straight to static text: there's no client-side re-render of this markup
// to disagree with (unlike ItineraryDays.tsx's "now/next", which lives in a
// 'use client' component and had to move its "now" into a post-mount
// useEffect to avoid a hydration mismatch — this page never hydrates a
// second computation of "now" at all, so that whole category of risk
// doesn't apply here).
function departureStatus(
  startDate: Date,
  endDate: Date,
  now: Date,
): { label: string; tone: 'accent' | 'muted' } {
  const utcDay = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dayMs = 24 * 60 * 60 * 1000;
  const startsIn = Math.round((utcDay(startDate) - utcDay(now)) / dayMs);
  const endsIn = Math.round((utcDay(endDate) - utcDay(now)) / dayMs);

  if (startsIn > 1) return { label: `In ${startsIn} days`, tone: 'accent' };
  if (startsIn === 1) return { label: 'Tomorrow', tone: 'accent' };
  if (startsIn === 0) return { label: 'Departs today', tone: 'accent' };
  if (endsIn >= 0) return { label: 'In progress', tone: 'accent' };
  const endedDaysAgo = -endsIn;
  return {
    label: `Ended ${endedDaysAgo} ${endedDaysAgo === 1 ? 'day' : 'days'} ago`,
    tone: 'muted',
  };
}

export const metadata: Metadata = {
  title: 'Your trips · Trip Planner',
};

export default async function TripsPage() {
  const [trips, invites] = await Promise.all([
    listTrips(),
    listPendingInvites(),
  ]);
  const now = new Date();

  return (
    <div className="flex flex-col flex-1 bg-surface">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-8 px-4 sm:py-16 sm:px-8"
      >
        <InvitesBanner invites={invites} />

        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-8">
          <h1 className="text-4xl font-semibold text-foreground">Your trips</h1>
          <nav aria-label="Trips actions" className="flex items-center gap-4">
            <Link
              href="/settings"
              className="text-sm text-zinc-600 dark:text-zinc-400 underline"
            >
              Settings
            </Link>
            <Link
              href="/trips/new"
              className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-fg hover:opacity-90"
            >
              Create trip
            </Link>
          </nav>
        </div>

        {trips.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-12 text-center">
            <p className="text-zinc-600 dark:text-zinc-400 mb-4">
              You haven&apos;t planned any trips yet.
            </p>
            <Link
              href="/trips/new"
              className="font-medium text-zinc-950 dark:text-zinc-50 underline"
            >
              Create your first trip
            </Link>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {trips.map((trip) => {
              const status = departureStatus(trip.startDate, trip.endDate, now);
              const dayCount = trip._count.days;
              return (
                <li
                  key={trip.id}
                  className="flex items-center gap-4 rounded-lg border border-border bg-surface-raised hover:bg-border/40"
                >
                  <Link
                    href={`/trips/${trip.id}`}
                    className="block flex-1 p-5 min-w-0"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <h2 className="min-w-0 truncate text-lg font-medium text-foreground">
                        {trip.name}
                      </h2>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-mono tabular-nums font-semibold ${
                          status.tone === 'accent'
                            ? 'bg-accent text-accent-fg'
                            : 'bg-border text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        {status.label}
                      </span>
                    </div>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      {trip.destinations.join(', ')}
                      {trip.destinations.length > 0 && ' · '}
                      <span className="font-mono tabular-nums">
                        {formatDateRange(trip.startDate, trip.endDate)}
                      </span>{' '}
                      ·{' '}
                      <span className="font-mono tabular-nums">{dayCount}</span>{' '}
                      {dayCount === 1 ? 'day' : 'days'}
                    </p>
                    <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                      <span className="font-mono tabular-nums">
                        {formatMoney(trip.budgetMinor, trip.baseCurrency)}
                      </span>{' '}
                      budget
                    </p>
                  </Link>
                  <form
                    action={duplicateTripAction.bind(null, trip.id)}
                    className="shrink-0 pr-5"
                  >
                    <SubmitButton
                      pendingLabel="Duplicating…"
                      className="text-sm text-zinc-600 dark:text-zinc-400 underline"
                    >
                      Duplicate
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
