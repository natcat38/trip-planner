'use server';

/**
 * The saved-places research tray (Phase 3 M1): search OpenStreetMap for
 * nearby places, save the ones worth keeping onto a trip, and promote a
 * saved place onto a Day as an Activity without re-geocoding it. Mirrors
 * src/server/itinerary.ts's shape and authorization pattern.
 * @packageDocumentation
 */

import { db } from '../lib/db';
import {
  isValidCurrencyCode,
  minorUnitExponent,
  toMinorUnits,
} from '../lib/money';
import { searchPlaces as searchOsmPlaces } from '../lib/research/overpass';
import { ForbiddenOrNotFoundError, requireTripAccess } from './auth-scope';
import { StaleWriteError, ValidationError } from './errors';
import { createActivity } from './itinerary';

export async function requirePlace(tripId: string, placeId: string) {
  const trip = await requireTripAccess(tripId);
  const place = await db.place.findFirst({
    where: { id: placeId, tripId: trip.id },
  });
  if (!place) throw new ForbiddenOrNotFoundError();
  return place;
}

interface SearchPlacesParams {
  lat: number;
  lng: number;
  radius: number;
  category?: string;
  query?: string;
}

export async function searchPlaces(tripId: string, params: SearchPlacesParams) {
  await requireTripAccess(tripId);
  return searchOsmPlaces(params);
}

interface PlaceFields {
  name: string;
  category: string;
  cuisine?: string;
  openingHours?: string;
  website?: string;
  phone?: string;
  notes?: string;
  costAmount?: number;
  costCurrency?: string;
}

export interface SavePlaceInput extends PlaceFields {
  source: string; // "osm" | "manual"
  sourceId?: string; // e.g. "node/1234567" — present for "osm", absent for "manual"
  lat: number;
  lng: number;
}

export interface PlaceUpdateInput extends PlaceFields {
  updatedAt: Date;
}

// Server Actions hand this client-supplied FormData, so a name has to be
// checked here rather than trusted from the hidden inputs the page renders.
// An empty one would otherwise persist a blank tray row and, once promoted,
// a titleless Activity with no pin (blank placeName skips the coordinate
// passthrough in ./itinerary.ts).
function validatePlaceName(name: string) {
  if (!name.trim()) throw new ValidationError('Enter a name for the place.');
}

function validatePlaceCost(input: {
  costAmount?: number;
  costCurrency?: string;
}) {
  if (input.costAmount == null) return;
  if (!(input.costAmount >= 0)) {
    throw new ValidationError('Enter an amount of 0 or more.');
  }
  if (!input.costCurrency || !isValidCurrencyCode(input.costCurrency)) {
    throw new ValidationError(
      'Enter a valid 3-letter currency code for the cost.',
    );
  }
}

// Fields the OSM search result itself supplies. Deliberately excludes
// notes/costMinor/costCurrency — those are edited later via updatePlace, and
// the OSM save form never sends them, so including them here would silently
// blank out notes/cost on every re-save of an already-annotated place (see
// the upsert's update branch below).
function resolveOsmFields(input: PlaceFields) {
  return {
    name: input.name,
    category: input.category,
    cuisine: input.cuisine || null,
    openingHours: input.openingHours || null,
    website: input.website || null,
    phone: input.phone || null,
  };
}

function resolvePlaceFields(input: PlaceFields) {
  return {
    ...resolveOsmFields(input),
    notes: input.notes || null,
    // validatePlaceCost already rejects a costAmount with no/invalid
    // costCurrency, so a present costAmount always has a usable currency here.
    costMinor:
      input.costAmount != null
        ? toMinorUnits(input.costAmount, input.costCurrency!)
        : null,
    costCurrency: input.costAmount != null ? input.costCurrency! : null,
  };
}

export async function savePlace(tripId: string, input: SavePlaceInput) {
  const trip = await requireTripAccess(tripId);
  validatePlaceName(input.name);
  validatePlaceCost(input);
  const data = {
    tripId: trip.id,
    source: input.source,
    sourceId: input.sourceId ?? null,
    lat: input.lat,
    lng: input.lng,
    ...resolvePlaceFields(input),
  };

  // @@unique([tripId, source, sourceId]) exists specifically so re-saving the
  // same OSM result is a no-op, not a 500 — upsert on that key instead of a
  // bare create+catch. Manual entries have no sourceId, and Postgres treats
  // every NULL as distinct in a unique index, so the constraint never fires
  // for them; a plain create is both correct and simpler there.
  if (input.sourceId) {
    return db.place.upsert({
      where: {
        tripId_source_sourceId: {
          tripId: trip.id,
          source: input.source,
          sourceId: input.sourceId,
        },
      },
      create: data,
      // Not `data`: re-saving an already-saved OSM place must not clobber
      // notes/cost the user has since added via updatePlace, since this form
      // never carries those fields.
      update: {
        lat: input.lat,
        lng: input.lng,
        ...resolveOsmFields(input),
      },
    });
  }
  return db.place.create({ data });
}

export async function updatePlace(
  tripId: string,
  placeId: string,
  input: PlaceUpdateInput,
) {
  const place = await requirePlace(tripId, placeId);
  validatePlaceName(input.name);
  validatePlaceCost(input);
  const result = await db.place.updateMany({
    where: { id: place.id, updatedAt: input.updatedAt },
    data: resolvePlaceFields(input),
  });
  if (result.count === 0) throw new StaleWriteError();
}

export async function deletePlace(tripId: string, placeId: string) {
  const place = await requirePlace(tripId, placeId);
  await db.place.delete({ where: { id: place.id } });
}

export async function listPlaces(tripId: string) {
  const trip = await requireTripAccess(tripId);
  return db.place.findMany({
    where: { tripId: trip.id },
    orderBy: { createdAt: 'asc' },
  });
}

// Promotes a saved place onto a Day as an Activity. Passes placeName + lat/lng
// together so createActivity's coordinate passthrough (resolveActivityData)
// trusts the place's known coordinates instead of firing a Mapbox text
// geocode — see knowledge/domain/places.md. Cost is
// converted from Place's minor-unit storage back to a decimal amount because
// ActivityInput's public surface takes costAmount, not costMinor; the round
// trip through toMinorUnits inside createActivity reproduces the same
// costMinor since both sides use the same currency's minorUnitExponent.
export async function addActivityFromPlace(
  tripId: string,
  placeId: string,
  dayId: string,
) {
  const place = await requirePlace(tripId, placeId);
  const activity = await createActivity(tripId, dayId, {
    title: place.name,
    placeName: place.name,
    lat: place.lat,
    lng: place.lng,
    category: place.category,
    notes: place.notes ?? undefined,
    costAmount:
      place.costMinor != null && place.costCurrency
        ? place.costMinor / 10 ** minorUnitExponent(place.costCurrency)
        : undefined,
    costCurrency: place.costCurrency ?? undefined,
  });
  return db.activity.update({
    where: { id: activity.id },
    data: { placeId: place.id },
  });
}
