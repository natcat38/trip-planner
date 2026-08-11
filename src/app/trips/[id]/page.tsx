/**
 * The single-trip route: itinerary days/activities and the multi-currency
 * budget roll-up for one trip, every page here reached only via
 * `requireTripAccess(tripId)` so a trip's nested resources can't be accessed by
 * their own id alone.
 * @packageDocumentation
 */
import Link from 'next/link';
import { ForbiddenOrNotFoundError, requireTripAccess } from '@/server/auth-scope';
import { ensureDaysForTrip } from '@/server/itinerary';
import { BudgetPanel } from './BudgetPanel';
import { ItineraryDays } from './ItineraryDays';

export default async function TripItineraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let trip;
  let days;
  try {
    trip = await requireTripAccess(id);
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

        <ItineraryDays tripId={trip.id} days={days} />
      </main>
    </div>
  );
}
