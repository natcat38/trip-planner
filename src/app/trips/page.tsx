/**
 * The trips list route: the signed-in user's trips overview and create/edit
 * entry points (`new/`, `[id]/edit/`) for the Trip aggregate itself.
 * @packageDocumentation
 */
import Link from 'next/link';
import { SubmitButton } from '@/components/SubmitButton';
import { formatMoney } from '@/lib/money';
import { listTrips } from '@/server/trips';
import { listPendingInvites } from '@/server/sharing';
import { InvitesBanner } from './InvitesBanner';
import { duplicateTripAction } from './actions';

function formatDateRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export default async function TripsPage() {
  const [trips, invites] = await Promise.all([
    listTrips(),
    listPendingInvites(),
  ]);

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <main className="flex-1 w-full max-w-3xl mx-auto py-16 px-8">
        <InvitesBanner invites={invites} />

        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
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
              className="rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Create trip
            </Link>
          </div>
        </div>

        {trips.length === 0 ? (
          <div className="rounded-lg border border-dashed border-black/[.08] p-12 text-center dark:border-white/25">
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
                className="flex items-center gap-4 rounded-lg border border-black/[.08] hover:bg-black/[.02] dark:border-white/25 dark:hover:bg-white/[.03]"
              >
                <Link href={`/trips/${trip.id}`} className="block flex-1 p-5">
                  <div className="flex items-baseline justify-between gap-4">
                    <h2 className="font-medium text-black dark:text-zinc-50">
                      {trip.name}
                    </h2>
                    <span className="text-sm text-zinc-600 dark:text-zinc-400">
                      {formatMoney(trip.budgetMinor, trip.baseCurrency)} budget
                    </span>
                  </div>
                  <p className="text-sm text-zinc-600 dark:text-zinc-400 mt-1">
                    {trip.destinations.join(', ')} ·{' '}
                    {formatDateRange(trip.startDate, trip.endDate)}
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
