/**
 * The single-trip route: itinerary days/activities and the multi-currency
 * budget roll-up for one trip, every page here reached only via
 * `requireTripAccess(tripId)` so a trip's nested resources can't be accessed by
 * their own id alone.
 * @packageDocumentation
 */
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  currentUserId,
  ForbiddenOrNotFoundError,
  requireTripAccess,
} from '@/server/auth-scope';
import { geocode } from '@/lib/geocode';
import { getTripWeather, type DayWeather } from '@/lib/research/weather';
import { getAttachmentUsage, listAttachments } from '@/server/attachments';
import { listChecklist } from '@/server/checklist';
import { ensureDaysForTrip } from '@/server/itinerary';
import { getShareStatus } from '@/server/sharing';
import { listVotesForTrip } from '@/server/votes';
import { BudgetPanel } from './BudgetPanel';
import { Attachments } from './Attachments';
import { Checklist } from './Checklist';
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
    // A forbidden trip and a missing trip render identically — notFound()
    // never leaks which one it was.
    if (err instanceof ForbiddenOrNotFoundError) notFound();
    throw err;
  }

  // The trip stores destination names, not coordinates — geocode() is
  // cached, so this is cheap on a warm cache. A null geocode (unresolvable
  // destination) just means no weather renders; never an error. This isn't
  // awaited here: it's handed to ItineraryDays as a promise so the
  // itinerary itself streams in immediately and each day's weather line
  // resolves independently behind its own <Suspense> (see
  // DayWeatherLine in ItineraryDays.tsx) instead of blocking the whole page
  // on geocode()+getTripWeather().
  const destination = trip.destinations[0];
  const weatherPromise: Promise<Record<string, DayWeather> | null> =
    (async () => {
      const geo = destination ? await geocode(destination) : null;
      if (!geo) return null;
      const weather = await getTripWeather(
        geo.lat,
        geo.lng,
        days.map((day) => day.date.toISOString().slice(0, 10)),
      );
      return Object.fromEntries(weather);
    })();

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-8 px-4 sm:py-16 sm:px-8"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-y-2 mb-8">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            {trip.name}
          </h1>
          <nav aria-label="Trip actions" className="flex flex-wrap gap-4">
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
          </nav>
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
          weatherPromise={weatherPromise}
          votes={await listVotesForTrip(trip.id)}
        />

        <Checklist tripId={trip.id} items={await listChecklist(trip.id)} />

        <Attachments
          tripId={trip.id}
          attachments={await listAttachments(trip.id)}
          usage={await getAttachmentUsage(trip.id)}
        />
      </main>
    </div>
  );
}
