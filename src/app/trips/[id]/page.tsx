/**
 * The single-trip route: itinerary days/activities and the multi-currency
 * budget roll-up for one trip, every page here reached only via
 * `requireTripAccess(tripId)` so a trip's nested resources can't be accessed by
 * their own id alone.
 * @packageDocumentation
 */
import type { Metadata } from 'next';
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
import { SelectedMap, SelectionProvider } from './ItinerarySelection';
import { TripBreadcrumb, TripTabs } from './TripNav';
import { TripLayout } from './TripLayout';
import { SharingPanel } from './SharingPanel';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const trip = await requireTripAccess(id);
    return { title: `${trip.name} · Trip Planner` };
  } catch {
    return {};
  }
}

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

  const [shareStatus, votes, checklist, attachments, attachmentUsage] =
    await Promise.all([
      isOwner ? getShareStatus(trip.id) : Promise.resolve(null),
      listVotesForTrip(trip.id),
      listChecklist(trip.id),
      listAttachments(trip.id),
      getAttachmentUsage(trip.id),
    ]);

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
    <div className="flex flex-col flex-1 bg-surface">
      <main
        id="main"
        tabIndex={-1}
        // Wide enough for the two-column layout TripLayout builds at lg
        // (itinerary beside the budget, sharing and a sticky map). Below lg
        // it is a single column, so B11's <=375px no-horizontal-scroll
        // guarantee is unaffected.
        className="flex-1 w-full max-w-6xl mx-auto py-4 px-4 sm:py-8 sm:px-8"
      >
        <TripBreadcrumb tripName={trip.name} />
        <h1 className="mb-3 text-4xl font-semibold text-foreground">
          {trip.name}
        </h1>
        <TripTabs tripId={trip.id} current="itinerary" />

        {/* The one client boundary shared by the map and the day rail:
            picking a row or a pin selects the other. */}
        <SelectionProvider>
          <TripLayout
            budget={<BudgetPanel tripId={trip.id} />}
            map={<SelectedMap pins={pins} />}
            days={
              <ItineraryDays
                tripId={trip.id}
                days={days}
                weatherPromise={weatherPromise}
                votes={votes}
              />
            }
            sharing={
              isOwner && shareStatus ? (
                <SharingPanel
                  tripId={trip.id}
                  status={shareStatus}
                  updatedAt={trip.updatedAt.toISOString()}
                />
              ) : undefined
            }
            extras={
              <>
                <Checklist tripId={trip.id} items={checklist} />
                <Attachments
                  tripId={trip.id}
                  attachments={attachments}
                  usage={attachmentUsage}
                />
              </>
            }
          />
        </SelectionProvider>
      </main>
    </div>
  );
}
