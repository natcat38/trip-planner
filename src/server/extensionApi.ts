/**
 * What `/api/extension/*` is allowed to do on behalf of a bearer token
 * (Phase 3 M7, ADR-0017). Every function here takes an identity as an
 * argument, because these run outside any session — the token is resolved to
 * a user id by src/server/extensionToken.ts before anything below is called.
 *
 * Deliberately NOT a `'use server'` module, and this one is not a matter of
 * taste: that directive publishes every export as a public HTTP endpoint, and
 * these functions take `userId` as a PARAMETER. Published as Server Actions
 * they would let any caller name whichever user they liked and act as them.
 * The same trap `src/server/aiSettings.ts` documents, with a worse payload.
 * @packageDocumentation
 */

import { DEFAULT_CATEGORY, isCategory } from '../lib/categories';
import { db } from '../lib/db';
import { geocode } from '../lib/geocode';
import { requireTripAccessForUser, tripAccessWhere } from './auth-scope';
import { ValidationError } from './errors';
import {
  MAX_NAME_LENGTH,
  MAX_NOTES_LENGTH,
  requireOptionalText,
  requireText,
} from './validation';

export interface ExtensionTripSummary {
  id: string;
  name: string;
  destinations: string[];
}

// Mirrors src/server/trips.ts's listTrips exactly, including its
// owned-or-accepted-collaborator scope — the app's own dashboard lists both,
// and the extension picker showing fewer trips than the app does would be a
// surprising place for that to diverge. Both build their `where` from the
// same tripAccessWhere helper (src/server/auth-scope.ts), so there is no
// second copy of the OR shape here to drift out of sync.
export async function listTripsForExtension(
  userId: string,
  email: string | undefined,
): Promise<ExtensionTripSummary[]> {
  return db.trip.findMany({
    where: tripAccessWhere(userId, email),
    orderBy: { startDate: 'desc' },
    select: { id: true, name: true, destinations: true },
  });
}

export interface SaveFromPageInput {
  tripId: string;
  name: string;
  url: string;
  category?: string;
  notes?: string;
}

// Only http(s). A saved place's URL is rendered as a link in the app, so
// `javascript:` or `data:` here would be a stored-XSS vector dressed up as a
// bookmark.
function normaliseUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new ValidationError('That page URL is not valid.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ValidationError('Only http and https pages can be saved.');
  }
  return parsed.toString();
}

export async function savePlaceFromPage(
  userId: string,
  email: string | undefined,
  input: SaveFromPageInput,
) {
  // The authorization gate, and the same one the rest of the app uses —
  // requireTripAccessForUser is the shared predicate behind requireTripAccess
  // (CLAUDE.md: a nested resource is never reachable by its own id alone).
  const trip = await requireTripAccessForUser(userId, email, input.tripId);

  const name = requireText(
    input.name ?? '',
    'name',
    MAX_NAME_LENGTH,
    'Enter a name for this place.',
  );
  // Rejected, not silently truncated: this and validateActivityInput's notes
  // check (src/server/itinerary.ts) are the same trust boundary — a client
  // that ignores the field's max length gets a 400 back, the same as any
  // other Server Action, rather than having its input quietly cut down.
  const notes =
    requireOptionalText(input.notes, 'note', MAX_NOTES_LENGTH) ?? null;
  const category = isCategory(input.category)
    ? input.category
    : DEFAULT_CATEGORY;
  const url = normaliseUrl(input.url);

  // Place.lat/lng are non-null, so a place that won't geocode cannot be
  // saved. Bias the lookup with the trip's own destination first: a blog post
  // says "Fuglen", and "Fuglen" alone lands wherever Mapbox likes best, while
  // "Fuglen, Tokyo" lands where the user is going. Fall back to the bare name
  // so a trip with no destination set still works.
  const destination = trip.destinations[0];
  const located =
    (destination ? await geocode(`${name}, ${destination}`) : null) ??
    (await geocode(name));
  if (!located) {
    throw new ValidationError(
      `Couldn't find "${name}" on the map. Try a more specific name, or add it in the app.`,
    );
  }

  const data = {
    tripId: trip.id,
    source: 'extension',
    sourceId: url,
    name,
    lat: located.lat,
    lng: located.lng,
    category,
    notes,
    // The page it came from IS the useful artefact here — the whole point of
    // the extension is "I found this on someone's blog".
    website: url,
  };

  // Upsert on @@unique([tripId, source, sourceId]) for the same reason
  // savePlace does it for OSM results: saving the same page twice should
  // update that place, not add a duplicate.
  //
  // The update deliberately differs from the create: `notes` is only written
  // when the popup actually supplied some. Name and category come from fields
  // the user just filled in, so overwriting those is what they asked for — but
  // the popup's notes box starts empty every time, so writing it
  // unconditionally means re-saving a page silently erases research typed into
  // the app. Nothing in the extension flow would ever hint that had happened.
  const { notes: _omitted, ...alwaysUpdated } = data;
  return db.place.upsert({
    where: {
      tripId_source_sourceId: {
        tripId: trip.id,
        source: 'extension',
        sourceId: url,
      },
    },
    create: data,
    update: notes ? data : alwaysUpdated,
  });
}
