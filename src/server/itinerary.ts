'use server';

import { db } from '../lib/db';
import { geocode } from '../lib/geocode';
import { isValidCurrencyCode, toMinorUnits } from '../lib/money';
import { ForbiddenOrNotFoundError, requireTripAccess } from './auth-scope';
import { StaleWriteError, ValidationError } from './errors';

async function requireDay(tripId: string, dayId: string) {
  const trip = await requireTripAccess(tripId);
  const day = await db.day.findFirst({ where: { id: dayId, tripId: trip.id } });
  if (!day) throw new ForbiddenOrNotFoundError();
  return day;
}

export async function requireActivity(tripId: string, activityId: string) {
  const trip = await requireTripAccess(tripId);
  const activity = await db.activity.findFirst({
    where: { id: activityId, day: { tripId: trip.id } },
  });
  if (!activity) throw new ForbiddenOrNotFoundError();
  return activity;
}

function dateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dateRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  for (
    const cursor = new Date(start);
    cursor <= end;
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    dates.push(new Date(cursor));
  }
  return dates;
}

// Additive only: generates any Day rows missing from the trip's current date
// range, never deletes existing ones. If a trip's dates later shrink, days
// (and any activities on them) outside the new range are left alone rather
// than cascade-deleted — see docs/adr/0005.
export async function ensureDaysForTrip(tripId: string) {
  const trip = await requireTripAccess(tripId);
  const existing = await db.day.findMany({ where: { tripId: trip.id } });
  const existingDates = new Set(existing.map((d) => dateOnly(d.date)));
  const missing = dateRange(trip.startDate, trip.endDate).filter(
    (date) => !existingDates.has(dateOnly(date)),
  );

  if (missing.length > 0) {
    await db.day.createMany({
      data: missing.map((date) => ({ tripId: trip.id, date })),
    });
  }

  return db.day.findMany({
    where: { tripId: trip.id },
    orderBy: { date: 'asc' },
    include: { activities: { orderBy: { sortOrder: 'asc' } } },
  });
}

// Day.notes is exposed on the public /shared/[token] route (see the schema
// comment) — itinerary content, like Activity.notes, is deliberately public.
export async function updateDayNotes(
  tripId: string,
  dayId: string,
  notes: string,
  updatedAt: Date,
) {
  const day = await requireDay(tripId, dayId);
  const result = await db.day.updateMany({
    where: { id: day.id, updatedAt },
    data: { notes: notes || null },
  });
  if (result.count === 0) throw new StaleWriteError();
}

export interface ActivityInput {
  title: string;
  placeName?: string;
  lat?: number;
  lng?: number;
  startTime?: string;
  endTime?: string;
  category: string;
  notes?: string;
  costAmount?: number;
  costCurrency?: string;
}

export interface ActivityUpdateInput extends ActivityInput {
  updatedAt: Date;
}

function validateActivityInput(input: ActivityInput) {
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

interface ExistingPlace {
  placeName: string | null;
  lat: number | null;
  lng: number | null;
}

// Re-geocodes only when placeName actually changed, so editing an activity's
// other fields doesn't waste a Mapbox call or risk clobbering a good pin with
// a failed lookup.
async function resolveActivityData(
  input: ActivityInput,
  existing?: ExistingPlace,
) {
  const placeName = input.placeName || null;
  let lat = existing?.lat ?? null;
  let lng = existing?.lng ?? null;

  if (input.lat != null && input.lng != null) {
    // Already-known coordinates (e.g. a saved OSM place) — trust them instead
    // of firing a Mapbox text geocode that could resolve elsewhere. Checked
    // before the placeName comparison, not inside it: coordinates supplied by
    // the caller must be honoured even when placeName is blank or unchanged,
    // otherwise they'd be silently dropped and the pin would go missing.
    lat = input.lat;
    lng = input.lng;
  } else if (placeName !== (existing?.placeName ?? null)) {
    const result = placeName ? await geocode(placeName) : null;
    lat = result?.lat ?? null;
    lng = result?.lng ?? null;
  }

  return {
    title: input.title,
    placeName,
    lat,
    lng,
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    category: input.category,
    notes: input.notes || null,
    // validateActivityInput already rejects a costAmount with no/invalid
    // costCurrency, so a present costAmount always has a usable currency here.
    costMinor:
      input.costAmount != null
        ? toMinorUnits(input.costAmount, input.costCurrency!)
        : null,
    costCurrency: input.costAmount != null ? input.costCurrency! : null,
  };
}

export async function createActivity(
  tripId: string,
  dayId: string,
  input: ActivityInput,
) {
  const day = await requireDay(tripId, dayId);
  validateActivityInput(input);
  const maxSortOrder = await db.activity.aggregate({
    where: { dayId: day.id },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;
  const data = await resolveActivityData(input);
  return db.activity.create({ data: { dayId: day.id, ...data, sortOrder } });
}

export async function updateActivity(
  tripId: string,
  activityId: string,
  input: ActivityUpdateInput,
) {
  const activity = await requireActivity(tripId, activityId);
  validateActivityInput(input);
  const data = await resolveActivityData(input, activity);
  const result = await db.activity.updateMany({
    where: { id: activity.id, updatedAt: input.updatedAt },
    data,
  });
  if (result.count === 0) throw new StaleWriteError();
}

export async function deleteActivity(tripId: string, activityId: string) {
  const activity = await requireActivity(tripId, activityId);
  await db.activity.delete({ where: { id: activity.id } });
}

// Client-supplied FormData, ultimately rendered straight into a marker's
// style.background (src/components/Map.tsx) — an unvalidated string here is
// a CSS-injection vector, so only a short hex triplet/sextuplet is accepted.
const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{3}$|^#[0-9a-fA-F]{6}$/;

export async function setActivityPinColor(
  tripId: string,
  activityId: string,
  color: string | null,
  updatedAt: Date,
) {
  const activity = await requireActivity(tripId, activityId);
  if (color != null && !HEX_COLOR_PATTERN.test(color)) {
    throw new ValidationError(
      'Pin colour must be a hex code like #e11d48, or left as default.',
    );
  }
  const result = await db.activity.updateMany({
    where: { id: activity.id, updatedAt },
    data: { pinColor: color },
  });
  if (result.count === 0) throw new StaleWriteError();
}

export async function moveActivity(
  tripId: string,
  activityId: string,
  direction: 'up' | 'down',
) {
  const activity = await requireActivity(tripId, activityId);
  const siblings = await db.activity.findMany({
    where: { dayId: activity.dayId },
    orderBy: { sortOrder: 'asc' },
  });
  const index = siblings.findIndex((a) => a.id === activity.id);
  // requireActivity already confirmed the activity exists and is in scope,
  // so a -1 here would mean it was deleted between that lookup and this
  // query — treat it the same as "not found" rather than crashing on
  // siblings[-1 ± 1] below.
  if (index === -1) throw new ForbiddenOrNotFoundError();
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) return;

  const other = siblings[swapIndex];
  // Each update's where includes the sortOrder read moments ago, so a
  // concurrent move of either activity (another tab, another collaborator)
  // makes one of these updateMany calls affect zero rows instead of
  // silently overwriting a swap already in flight. An interactive
  // transaction (not the array form) so a mismatch's throw rolls the whole
  // swap back instead of committing half of it — the error becomes
  // ForbiddenOrNotFoundError, which moveActivityAction's ignoreIfMissing
  // wrapper turns into a silent no-op, and the page re-renders whatever
  // order actually won the race.
  await db.$transaction(async (tx) => {
    const first = await tx.activity.updateMany({
      where: { id: activity.id, sortOrder: activity.sortOrder },
      data: { sortOrder: other.sortOrder },
    });
    const second = await tx.activity.updateMany({
      where: { id: other.id, sortOrder: other.sortOrder },
      data: { sortOrder: activity.sortOrder },
    });
    if (first.count === 0 || second.count === 0) {
      throw new ForbiddenOrNotFoundError();
    }
  });
}
