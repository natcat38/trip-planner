/**
 * The Places route (Phase 3 M1): a destination research and saved-places
 * tray for one trip, reached only via `requireTripAccess(tripId)` like the
 * rest of `src/app/trips/[id]/*`. Top to bottom: a Wikivoyage destination
 * guide panel that degrades honestly when coverage is thin/none/unavailable
 * (docs/phase-3-research-layer-handoff.md §4), an OSM place search, and the
 * saved tray with a day picker to promote a place onto the itinerary.
 * @packageDocumentation
 */
import { Suspense } from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ForbiddenOrNotFoundError,
  requireTripAccess,
} from '@/server/auth-scope';
import { geocode } from '@/lib/geocode';
import type { Guide } from '@/lib/research/wikivoyage';
import { getGuide } from '@/lib/research/wikivoyage';
import { getKeyStatus } from '@/server/aiSettings';
import { ensureDaysForTrip } from '@/server/itinerary';
import { listPlaces, searchPlaces } from '@/server/places';
import { Map } from '@/components/Map';
import { Select } from '@/components/Select';
import { SubmitButton } from '@/components/SubmitButton';
import { saveOsmPlaceAction } from './actions';
import { DayPlanner } from './DayPlanner';
import { GuideSummary } from './GuideSummary';
import { PlaceRow } from './PlaceRow';

// Vercel Hobby's 10s default is a real risk given observed Overpass 504s and
// retries (docs/phase-3-research-layer-handoff.md §5.9).
export const maxDuration = 60;

const SEARCH_RADIUS_M = 1500;

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const GUIDE_SECTIONS: { key: keyof Guide['sections']; label: string }[] = [
  { key: 'eat', label: 'Eat' },
  { key: 'see', label: 'See' },
  { key: 'do', label: 'Do' },
  { key: 'getAround', label: 'Get around' },
  { key: 'getIn', label: 'Get in' },
];

function GuidePanel({
  destination,
  guide,
  tripId,
  hasApiKey,
}: {
  destination: string | null;
  guide: Guide | null;
  tripId: string;
  hasApiKey: boolean;
}) {
  if (!destination) {
    return (
      <section className="mb-10 rounded-lg border border-black/[.08] p-5 dark:border-white/25">
        <h2 className="font-medium text-black dark:text-zinc-50 mb-2">
          Destination guide
        </h2>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          This trip has no destination set, so there&apos;s no guide to show.
        </p>
      </section>
    );
  }

  // Honest degrade path (§4): a failed fetch (guide === null) and a resolved
  // guide with no usable content (coverage === 'none') both render an
  // explicit message and point at OSM search instead of an empty panel.
  if (guide == null || guide.coverage === 'none') {
    return (
      <section className="mb-10 rounded-lg border border-black/[.08] p-5 dark:border-white/25">
        <h2 className="font-medium text-black dark:text-zinc-50 mb-2">
          Destination guide
        </h2>
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Limited guide data for {destination}. Use place search below instead.
        </p>
        {guide?.url && (
          <a
            href={guide.url}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-sm text-zinc-600 dark:text-zinc-400 underline"
          >
            See the full guide on Wikivoyage
          </a>
        )}
      </section>
    );
  }

  const availableSections = GUIDE_SECTIONS.filter(
    ({ key }) => guide.sections[key],
  );

  return (
    <section className="mb-10 rounded-lg border border-black/[.08] p-5 dark:border-white/25">
      <div className="flex items-baseline justify-between mb-2 gap-4">
        <h2 className="font-medium text-black dark:text-zinc-50">
          Destination guide — {guide.title}
        </h2>
        <span
          className={
            guide.coverage === 'good'
              ? 'shrink-0 text-xs text-green-700 dark:text-green-400'
              : 'shrink-0 text-xs text-amber-700 dark:text-amber-400'
          }
        >
          {guide.coverage === 'good' ? 'Good coverage' : 'Limited coverage'}
        </span>
      </div>

      {guide.coverage === 'thin' && (
        <p className="mb-4 text-sm text-amber-700 dark:text-amber-400">
          Limited guide data for {destination} — some sections may be missing.
          Place search below still works.
        </p>
      )}

      {availableSections.length === 0 ? (
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          No guide sections found for {destination}.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {availableSections.map(({ key, label }) => (
            <details
              key={key}
              className="rounded border border-dashed border-black/[.08] p-3 dark:border-white/25"
            >
              <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-50">
                {label}
              </summary>
              <p className="mt-2 whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">
                {guide.sections[key]}
              </p>
            </details>
          ))}
        </div>
      )}

      {availableSections.length > 0 &&
        (hasApiKey ? (
          <GuideSummary tripId={tripId} />
        ) : (
          <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
            <Link href="/settings" className="underline">
              Add an API key
            </Link>{' '}
            in Settings to summarize this guide with AI.
          </p>
        ))}

      <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
        Any prices above are sample prices quoted from the guide text, not a
        computed average. Guide content from{' '}
        <a
          href={guide.url || 'https://en.wikivoyage.org'}
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          Wikivoyage
        </a>
        , available under{' '}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/"
          target="_blank"
          rel="noreferrer"
          className="underline"
        >
          CC BY-SA
        </a>
        .
      </p>
    </section>
  );
}

// A skeleton, not a spinner: sized to GuidePanel's real "limited coverage"
// shape (heading + a couple of text lines) so nothing shifts when the
// streamed guide content swaps in.
function GuideSkeleton() {
  return (
    <section className="mb-10 rounded-lg border border-black/[.08] p-5 dark:border-white/25">
      <div className="h-5 w-40 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800 mb-3" />
      <div className="h-4 w-full animate-pulse rounded bg-zinc-200 dark:bg-zinc-800 mb-2" />
      <div className="h-4 w-3/4 animate-pulse rounded bg-zinc-200 dark:bg-zinc-800" />
    </section>
  );
}

// getGuide() is a live Wikivoyage fetch (see the module doc comment in
// ../../../lib/research/wikivoyage.ts) — isolated here, unawaited by the
// page itself, so the search form and saved-places map/list below render
// immediately instead of waiting on it. Wrapped in <Suspense> at the call
// site with GuideSkeleton as the fallback.
async function GuidePanelAsync({
  destination,
  tripId,
  hasApiKey,
}: {
  destination: string | null;
  tripId: string;
  hasApiKey: boolean;
}) {
  const guide = destination ? await getGuide(destination) : null;
  return (
    <GuidePanel
      destination={destination}
      guide={guide}
      tripId={tripId}
      hasApiKey={hasApiKey}
    />
  );
}

export default async function PlacesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id: tripId } = await params;
  // Next hands back an array when a key is repeated (?q=a&q=b), so collapse to
  // one value rather than letting an array through as if it were a string.
  const raw = await searchParams;
  const q = firstParam(raw.q);
  const category = firstParam(raw.category);

  let trip;
  let days;
  try {
    trip = await requireTripAccess(tripId);
    days = await ensureDaysForTrip(tripId);
  } catch (err) {
    // A forbidden trip and a missing trip render identically — notFound()
    // never leaks which one it was.
    if (err instanceof ForbiddenOrNotFoundError) notFound();
    throw err;
  }

  const destination = trip.destinations[0] ?? null;

  const [center, savedPlaces, keyStatus] = await Promise.all([
    destination ? geocode(destination) : null,
    listPlaces(tripId),
    getKeyStatus(),
  ]);

  // Only query Overpass when the user actually searched. Overpass is a
  // fair-use community service (§5.1) and a bare page view has nothing to
  // ask it for.
  const searchResults =
    center && (q || category)
      ? await searchPlaces(tripId, {
          lat: center.lat,
          lng: center.lng,
          radius: SEARCH_RADIUS_M,
          category: category || undefined,
          query: q || undefined,
        })
      : [];

  const pins = savedPlaces.map((place) => ({
    id: place.id,
    lat: place.lat,
    lng: place.lng,
    title: place.name,
  }));

  // A model id ending ":free" is OpenRouter's free-tier convention (ADR-0011)
  // — those endpoints generally require permission to train on and publish
  // prompts. DayPlanner shows the notice at the point of generating, not only
  // in Settings, because that's the moment the trade actually applies.
  const showFreeModelNotice = keyStatus?.model?.endsWith(':free') ?? false;

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <main className="flex-1 w-full max-w-3xl mx-auto py-16 px-8">
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            Places — {trip.name}
          </h1>
          <Link
            href={`/trips/${trip.id}`}
            className="text-sm text-zinc-600 dark:text-zinc-400 underline"
          >
            Back to itinerary
          </Link>
        </div>

        <Suspense fallback={<GuideSkeleton />}>
          <GuidePanelAsync
            destination={destination}
            tripId={tripId}
            hasApiKey={keyStatus != null}
          />
        </Suspense>

        <section className="mb-10 rounded-lg border border-black/[.08] p-5 dark:border-white/25">
          <h2 className="font-medium text-black dark:text-zinc-50 mb-4">
            Search places
          </h2>

          {center == null ? (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {destination
                ? `We couldn't locate "${destination}" to search nearby places.`
                : "This trip has no destination set, so places can't be searched."}
            </p>
          ) : (
            <>
              <form method="get" className="flex flex-wrap gap-3 mb-4">
                <label className="flex flex-1 flex-col gap-1">
                  <span className="sr-only">Search places</span>
                  <input
                    type="search"
                    name="q"
                    autoComplete="off"
                    defaultValue={q ?? ''}
                    placeholder="Search (e.g. ramen)"
                    className="w-full rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/25 dark:bg-transparent"
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="sr-only">Category</span>
                  <Select
                    name="category"
                    defaultValue={category ?? ''}
                    className="px-3 py-2 text-sm text-black dark:text-zinc-50"
                    options={[
                      { value: '', label: 'All categories' },
                      { value: 'Food', label: 'Food' },
                      { value: 'Sightseeing', label: 'Sightseeing' },
                      { value: 'Transport', label: 'Transport' },
                      { value: 'Lodging', label: 'Lodging' },
                      { value: 'Other', label: 'Other' },
                    ]}
                  />
                </label>
                <SubmitButton
                  pendingLabel="Searching…"
                  className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
                >
                  Search
                </SubmitButton>
              </form>

              {searchResults.length === 0 ? (
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  {q || category
                    ? 'No results — try a different search or category.'
                    : 'Search nearby places to see results here.'}
                </p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {searchResults.map((place) => (
                    <li
                      key={place.id}
                      className="flex items-start justify-between gap-4 rounded-lg border border-black/[.08] p-4 dark:border-white/25"
                    >
                      <div>
                        <p className="font-medium text-black dark:text-zinc-50">
                          {place.name}{' '}
                          <span className="font-normal text-zinc-500 dark:text-zinc-400">
                            ({place.category})
                          </span>
                        </p>
                        <p className="text-sm text-zinc-600 dark:text-zinc-400">
                          {[place.cuisine, place.openingHours, place.phone]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        {place.website && (
                          <a
                            href={place.website}
                            target="_blank"
                            rel="noreferrer"
                            className="text-sm text-zinc-600 dark:text-zinc-400 underline"
                          >
                            Website
                          </a>
                        )}
                      </div>
                      <form
                        action={saveOsmPlaceAction.bind(null, tripId)}
                        className="shrink-0"
                      >
                        <input type="hidden" name="sourceId" value={place.id} />
                        <input type="hidden" name="name" value={place.name} />
                        <input type="hidden" name="lat" value={place.lat} />
                        <input type="hidden" name="lng" value={place.lng} />
                        <input
                          type="hidden"
                          name="category"
                          value={place.category}
                        />
                        <input
                          type="hidden"
                          name="cuisine"
                          value={place.cuisine ?? ''}
                        />
                        <input
                          type="hidden"
                          name="openingHours"
                          value={place.openingHours ?? ''}
                        />
                        <input
                          type="hidden"
                          name="website"
                          value={place.website ?? ''}
                        />
                        <input
                          type="hidden"
                          name="phone"
                          value={place.phone ?? ''}
                        />
                        <button
                          type="submit"
                          className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
                        >
                          Save
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-4 text-xs text-zinc-500 dark:text-zinc-400">
                Place data ©{' '}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  OpenStreetMap
                </a>{' '}
                contributors, available under the{' '}
                <a
                  href="https://opendatacommons.org/licenses/odbl/"
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  Open Database License
                </a>
                .
              </p>
            </>
          )}
        </section>

        <section>
          <h2 className="font-medium text-black dark:text-zinc-50 mb-4">
            Saved places
          </h2>

          <Map pins={pins} />

          {savedPlaces.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-600 dark:text-zinc-400">
              No saved places yet — search above and save the ones you like.
            </p>
          ) : (
            <ul className="mt-4 flex flex-col gap-3">
              {savedPlaces.map((place) => (
                <PlaceRow
                  key={place.id}
                  tripId={tripId}
                  place={place}
                  days={days}
                />
              ))}
            </ul>
          )}
        </section>

        <DayPlanner
          tripId={tripId}
          days={days}
          showFreeModelNotice={showFreeModelNotice}
        />
      </main>
    </div>
  );
}
