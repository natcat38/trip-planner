/**
 * The single-trip route: itinerary days/activities and the multi-currency
 * budget roll-up for one trip, every page here reached only via
 * `requireTripAccess(tripId)` so a trip's nested resources can't be accessed by
 * their own id alone.
 * @packageDocumentation
 */
import Link from 'next/link';
import {
  currentUserId,
  ForbiddenOrNotFoundError,
  requireTripAccess,
} from '@/server/auth-scope';
import { geocode } from '@/lib/geocode';
import { getTripWeather } from '@/lib/research/weather';
import { ensureDaysForTrip } from '@/server/itinerary';
import { getShareStatus } from '@/server/sharing';
import { BudgetPanel } from './BudgetPanel';
import { ItineraryDays } from './ItineraryDays';
import { SharingPanel } from './SharingPanel';

export default async function TripItineraryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let trip;
  let days;
  let isOwner = false;
  try {
    trip = await requireTripAccess(id);
    days = await ensureDaysForTrip(id);
    isOwner = trip.userId === (await currentUserId());
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

  // The trip stores destination names, not coordinates — geocode() is
  // cached, so this is cheap on a warm cache. A null geocode (unresolvable
  // destination) just means no weather renders; never an error.
  const destination = trip.destinations[0];
  const geo = destination ? await geocode(destination) : null;
  const weather = geo
    ? await getTripWeather(
        geo.lat,
        geo.lng,
        days.map((day) => day.date.toISOString().slice(0, 10)),
      )
    : null;

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <main className="flex-1 w-full max-w-3xl mx-auto py-16 px-8">
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            {trip.name}
          </h1>
          <div className="flex gap-4">
            <Link
              href={`/trips/${trip.id}/places`}
              className="text-sm text-zinc-600 dark:text-zinc-400 underline"
            >
              Places
            </Link>
            <Link
              href={`/trips/${trip.id}/print`}
              className="text-sm text-zinc-600 dark:text-zinc-400 underline"
            >
              Export PDF
            </Link>
            <Link
              href={`/trips/${trip.id}/calendar.ics`}
              className="text-sm text-zinc-600 dark:text-zinc-400 underline"
            >
              Add to Calendar
            </Link>
            <Link
              href={`/trips/${trip.id}/edit`}
              className="text-sm text-zinc-600 dark:text-zinc-400 underline"
            >
              Edit trip
            </Link>
          </div>
        </div>

        <BudgetPanel tripId={trip.id} />

        {isOwner && (
          <SharingPanel
            tripId={trip.id}
            status={await getShareStatus(trip.id)}
          />
        )}

        <ItineraryDays
          tripId={trip.id}
          days={days}
          weather={weather ? Object.fromEntries(weather) : null}
        />
      </main>
    </div>
  );
}
