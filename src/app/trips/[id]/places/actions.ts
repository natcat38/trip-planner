'use server';

/**
 * Server Actions for the Places route: save an OSM search result onto the
 * trip, edit a saved place's notes/cost, delete it, or promote it onto a
 * Day as an Activity. Mirrors ../actions.ts's shape — thin wrappers around
 * src/server/places.ts that translate FormData and revalidate the page.
 * @packageDocumentation
 */

import { revalidatePath } from 'next/cache';
import { ignoreIfMissing } from '@/server/auth-scope';
import { StaleWriteError, ValidationError } from '@/server/errors';
import {
  addActivityFromPlace,
  deletePlace,
  savePlace,
  updatePlace,
  type SavePlaceInput,
} from '@/server/places';

export interface PlaceFormState {
  error?: string;
}

export async function saveOsmPlaceAction(
  tripId: string,
  formData: FormData,
): Promise<void> {
  const input: SavePlaceInput = {
    source: 'osm',
    sourceId: String(formData.get('sourceId') ?? ''),
    name: String(formData.get('name') ?? ''),
    lat: Number(formData.get('lat')),
    lng: Number(formData.get('lng')),
    category: String(formData.get('category') ?? ''),
    cuisine: String(formData.get('cuisine') ?? '') || undefined,
    openingHours: String(formData.get('openingHours') ?? '') || undefined,
    website: String(formData.get('website') ?? '') || undefined,
    phone: String(formData.get('phone') ?? '') || undefined,
  };
  await savePlace(tripId, input);
  revalidatePath(`/trips/${tripId}/places`);
}

function parsePlaceEditFormData(formData: FormData) {
  const costAmountRaw = formData.get('costAmount');
  const hasCost = costAmountRaw != null && String(costAmountRaw).trim() !== '';
  return {
    name: String(formData.get('name') ?? ''),
    category: String(formData.get('category') ?? ''),
    cuisine: String(formData.get('cuisine') ?? '') || undefined,
    openingHours: String(formData.get('openingHours') ?? '') || undefined,
    website: String(formData.get('website') ?? '') || undefined,
    phone: String(formData.get('phone') ?? '') || undefined,
    notes: String(formData.get('notes') ?? '') || undefined,
    costAmount: hasCost ? Number(costAmountRaw) : undefined,
    costCurrency: hasCost
      ? String(formData.get('costCurrency') ?? '').toUpperCase()
      : undefined,
  };
}

export async function updatePlaceAction(
  tripId: string,
  placeId: string,
  updatedAt: string,
  _prevState: PlaceFormState,
  formData: FormData,
): Promise<PlaceFormState> {
  try {
    await updatePlace(tripId, placeId, {
      ...parsePlaceEditFormData(formData),
      updatedAt: new Date(updatedAt),
    });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof StaleWriteError)
      return { error: err.message };
    throw err;
  }
  revalidatePath(`/trips/${tripId}/places`);
  return {};
}

export async function deletePlaceAction(
  tripId: string,
  placeId: string,
): Promise<void> {
  await ignoreIfMissing(deletePlace(tripId, placeId));
  revalidatePath(`/trips/${tripId}/places`);
}

export async function addActivityFromPlaceAction(
  tripId: string,
  placeId: string,
  formData: FormData,
): Promise<void> {
  const dayId = String(formData.get('dayId') ?? '');
  if (!dayId) return;
  await ignoreIfMissing(
    (async () => {
      await addActivityFromPlace(tripId, placeId, dayId);
    })(),
  );
  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/places`);
}
