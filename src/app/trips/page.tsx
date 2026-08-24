/**
 * The trips list route: the signed-in user's trips overview and create/edit
 * entry points (`new/`, `[id]/edit/`) for the Trip aggregate itself.
 * @packageDocumentation
 */
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { formatMoney } from '@/lib/money';
import { formatDateRange } from '@/lib/format';
import { listTrips } from '@/server/trips';
import { listPendingInvites } from '@/server/sharing';
import { InvitesBanner } from './InvitesBanner';
import { duplicateTripAction } from './actions';

export default async function TripsPage() {
  const [trips, invites] = await Promise.all([
    listTrips(),
    listPendingInvites(),
  ]);

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-8 px-4 sm:py-16 sm:px-8"
      >
        <InvitesBanner invites={invites} />

        <div className="flex flex-wrap items-center justify-between gap-y-2 mb-8">
          <h1 className="text-4xl font-semibold text-black dark:text-zinc-50">
            Your trips
          </h1>
          <div className="flex items-center gap-4">
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
          </div>
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
            {trips.map((trip) => (
              <li
                key={trip.id}
                className="flex items-center gap-4 rounded-lg border border-border hover:bg-surface-raised"
              >
                <Link href={`/trips/${trip.id}`} className="block flex-1 p-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="text-lg font-medium text-black dark:text-zinc-50">
                      {trip.name}
                    </h2>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      <span className="font-mono tabular-nums">
                        {formatMoney(trip.budgetMinor, trip.baseCurrency)}
                      </span>{' '}
                      budget
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                    {trip.destinations.join(', ')} ·{' '}
                    <span className="font-mono tabular-nums">
                      {formatDateRange(trip.startDate, trip.endDate)}
                    </span>
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
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
