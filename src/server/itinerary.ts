'use server';

import { db } from '../lib/db';
import { toMinorUnits } from '../lib/money';
import { ForbiddenOrNotFoundError, requireTrip } from './auth-scope';
import { ValidationError } from './errors';

async function requireDay(tripId: string, dayId: string) {
  const trip = await requireTrip(tripId);
  const day = await db.day.findFirst({ where: { id: dayId, tripId: trip.id } });
  if (!day) throw new ForbiddenOrNotFoundError();
  return day;
}

async function requireActivity(tripId: string, activityId: string) {
  const trip = await requireTrip(tripId);
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
  const trip = await requireTrip(tripId);
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

export interface ActivityInput {
  title: string;
  placeName?: string;
  startTime?: string;
  endTime?: string;
  category: string;
  notes?: string;
  costAmount?: number;
  costCurrency?: string;
}

function validateActivityInput(input: ActivityInput) {
  if (input.costAmount != null && !(input.costAmount >= 0)) {
    throw new ValidationError('Enter an amount of 0 or more.');
  }
}

function activityData(input: ActivityInput) {
  return {
    title: input.title,
    placeName: input.placeName || null,
    startTime: input.startTime || null,
    endTime: input.endTime || null,
    category: input.category,
    notes: input.notes || null,
    costMinor:
      input.costAmount != null && input.costCurrency
        ? toMinorUnits(input.costAmount, input.costCurrency)
        : null,
    costCurrency:
      input.costAmount != null ? (input.costCurrency ?? null) : null,
  };
}

export async function createActivity(
  tripId: string,
  dayId: string,
  input: ActivityInput,
) {
  const day = await requireDay(tripId, dayId);
  validateActivityInput(input);
  const sortOrder = await db.activity.count({ where: { dayId: day.id } });
  return db.activity.create({
    data: { dayId: day.id, ...activityData(input), sortOrder },
  });
}

export async function updateActivity(
  tripId: string,
  activityId: string,
  input: ActivityInput,
) {
  const activity = await requireActivity(tripId, activityId);
  validateActivityInput(input);
  return db.activity.update({
    where: { id: activity.id },
    data: activityData(input),
  });
}

export async function deleteActivity(tripId: string, activityId: string) {
  const activity = await requireActivity(tripId, activityId);
  await db.activity.delete({ where: { id: activity.id } });
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
  const swapIndex = direction === 'up' ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= siblings.length) return;

  const other = siblings[swapIndex];
  await db.$transaction([
    db.activity.update({
      where: { id: activity.id },
      data: { sortOrder: other.sortOrder },
    }),
    db.activity.update({
      where: { id: other.id },
      data: { sortOrder: activity.sortOrder },
    }),
  ]);
}
