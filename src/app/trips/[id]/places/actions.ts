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
import { generateDayPlans, type DayPlanCandidate } from '@/server/dayPlan';
import { StaleWriteError, ValidationError } from '@/server/errors';
import { summarizeGuide } from '@/server/guideSummary';
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

export interface GuideSummaryFormState {
  text?: string;
  error?: string;
}

export interface DayPlanFormState {
  candidates?: DayPlanCandidate[];
  source?: 'ai' | 'algorithmic';
  notice?: string;
  error?: string;
}

export interface AcceptDayPlanFormState {
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

// Deliberately a no-op read: never mutates anything, so nothing here for
// CLAUDE.md's stale-write rule to apply to (same rationale as
// planTransitAction in ../actions.ts). Still gated through summarizeGuide ->
// requireTripAccess on every call.
export async function summarizeGuideAction(
  tripId: string,
  _prevState: GuideSummaryFormState,
  _formData: FormData,
): Promise<GuideSummaryFormState> {
  const result = await summarizeGuide(tripId);
  return 'error' in result ? { error: result.error } : { text: result.text };
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

// Deliberately a no-op read: never mutates anything, so nothing here for
// CLAUDE.md's stale-write rule to apply to. Generation is on click only
// (DayPlanner.tsx) — never fired from render — because it may spend the
// user's own metered AI quota (ADR-0011/0012).
export async function generateDayPlanAction(
  tripId: string,
  _prevState: DayPlanFormState,
  formData: FormData,
): Promise<DayPlanFormState> {
  const focus = formData.getAll('focus').map(String);
  const paceRaw = String(formData.get('pace') ?? 'relaxed');
  const pace = paceRaw === 'packed' ? 'packed' : 'relaxed';

  const result = await generateDayPlans({ tripId, focus, pace });
  if ('error' in result) return { error: result.error };
  return {
    candidates: result.candidates,
    source: result.source,
    notice: result.notice,
  };
}

// Accepts one ephemeral candidate (DayPlanner.tsx keeps candidates only in
// component state, per ADR-0012 — no table, no migration): adds every place
// in the candidate to the chosen day, in order, reusing
// addActivityFromPlace exactly like PlaceRow's own "Add to day" form. A
// place that's since been deleted from the tray is skipped rather than
// failing the whole batch, same tolerance as addActivityFromPlaceAction
// above.
export async function acceptDayPlanAction(
  tripId: string,
  _prevState: AcceptDayPlanFormState,
  formData: FormData,
): Promise<AcceptDayPlanFormState> {
  const dayId = String(formData.get('dayId') ?? '');
  const placeIds = formData.getAll('placeId').map(String);
  if (!dayId || placeIds.length === 0) return {};

  for (const placeId of placeIds) {
    await ignoreIfMissing(
      (async () => {
        await addActivityFromPlace(tripId, placeId, dayId);
      })(),
    );
  }

  revalidatePath(`/trips/${tripId}`);
  revalidatePath(`/trips/${tripId}/places`);
  return {};
}
