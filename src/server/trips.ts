'use server';

/**
 * The server-side domain layer: Trip/Day/Activity/Expense/Budget business
 * logic and the `requireTripAccess`/`requireActivity` authorization gate that
 * every nested-resource lookup must go through, never a bare id.
 * @packageDocumentation
 */

import { db } from '../lib/db';
import { isValidCurrencyCode, toMinorUnits } from '../lib/money';
import {
  currentUserId,
  requireTripAccess,
  requireTripOwner,
} from './auth-scope';
import { ValidationError, StaleWriteError } from './errors';

export interface TripInput {
  name: string;
  destinations: string[];
  startDate: Date;
  endDate: Date;
  baseCurrency: string;
  budgetAmount: number;
}

export interface TripUpdateInput extends TripInput {
  updatedAt: Date;
}

function validateTripInput(input: TripInput) {
  if (input.endDate < input.startDate) {
    throw new ValidationError('End date must be on or after the start date.');
  }
  if (!isValidCurrencyCode(input.baseCurrency)) {
    throw new ValidationError('Enter a valid 3-letter currency code.');
  }
  if (!(input.budgetAmount >= 0)) {
    // catches negative amounts and NaN in one guard (NaN < 0 is false, so a plain
    // "< 0" check would silently let a non-numeric amount through to the database)
    throw new ValidationError('Enter an amount of 0 or more.');
  }
}

export async function listTrips() {
  const userId = await currentUserId();
  return db.trip.findMany({
    where: { userId },
    orderBy: { startDate: 'desc' },
  });
}

export async function createTrip(input: TripInput) {
  const userId = await currentUserId();
  validateTripInput(input);
  return db.trip.create({
    data: {
      userId,
      name: input.name,
      destinations: input.destinations,
      startDate: input.startDate,
      endDate: input.endDate,
      baseCurrency: input.baseCurrency,
      budgetMinor: toMinorUnits(input.budgetAmount, input.baseCurrency),
    },
  });
}

export async function updateTrip(tripId: string, input: TripUpdateInput) {
  const trip = await requireTripAccess(tripId);
  validateTripInput(input);
  const result = await db.trip.updateMany({
    where: { id: tripId, userId: trip.userId, updatedAt: input.updatedAt },
    data: {
      name: input.name,
      destinations: input.destinations,
      startDate: input.startDate,
      endDate: input.endDate,
      baseCurrency: input.baseCurrency,
      budgetMinor: toMinorUnits(input.budgetAmount, input.baseCurrency),
    },
  });
  if (result.count === 0) throw new StaleWriteError();
}

export async function deleteTrip(tripId: string) {
  const trip = await requireTripOwner(tripId);
  await db.trip.delete({ where: { id: trip.id } });
}

// Deep-copies a trip the caller can already access (owner or accepted
// collaborator) into a brand new trip owned by *them*. Everything is
// re-created under the new trip: Days, Activities, Places, and Expenses.
// Wrapped in one transaction so a failure partway through (e.g. a bad
// Activity row) can't leave an orphaned half-copied trip behind.
//
// Deliberately NOT copied, each for its own reason:
// - shareToken: it's @unique on Trip, so copying it would throw a unique
//   constraint violation, and — far worse — would hand the copy someone
//   else's public share URL. Every duplicate starts unshared (null).
// - collaborators: they agreed to be on the ORIGINAL trip, not on a copy
//   someone else made of it. The copy starts with no collaborators.
// - userId: the copy belongs to whoever ran this action, via currentUserId(),
//   not to the original trip's owner.
export async function duplicateTrip(tripId: string) {
  const trip = await requireTripAccess(tripId);
  const userId = await currentUserId();

  // An explicit budget, not Prisma's 5s default: this is one sequential create
  // per place, day, activity and expense, and a two-week trip is easily 100+
  // round trips. That is quick against local Postgres and much slower against
  // Neon over the network, where the default would roll the whole copy back on
  // a trip that is merely well-planned.
  // ponytail: raising the ceiling, not removing it — if trips ever get big
  // enough to strain this, batch with createMany and pre-generated ids.
  const TRANSACTION_OPTIONS = { timeout: 20_000, maxWait: 10_000 };

  return db.$transaction(async (tx) => {
    const newTrip = await tx.trip.create({
      data: {
        userId,
        name: `${trip.name} (copy)`,
        destinations: trip.destinations,
        startDate: trip.startDate,
        endDate: trip.endDate,
        baseCurrency: trip.baseCurrency,
        budgetMinor: trip.budgetMinor,
      },
    });

    // Copy Places first and remember old id -> new id, so the Activities
    // copied below can be repointed at the COPIED place instead of the
    // original one. Getting this backwards is silent at copy time — it only
    // surfaces later, e.g. when the original trip (and its places) is
    // deleted and the copy's activities are left pointing at rows that no
    // longer exist.
    const places = await tx.place.findMany({ where: { tripId: trip.id } });
    const placeIdMap = new Map<string, string>();
    for (const place of places) {
      const {
        id: _id,
        tripId: _tripId,
        createdAt: _createdAt,
        updatedAt: _updatedAt,
        ...rest
      } = place;
      const newPlace = await tx.place.create({
        data: { ...rest, tripId: newTrip.id },
      });
      placeIdMap.set(place.id, newPlace.id);
    }

    const days = await tx.day.findMany({
      where: { tripId: trip.id },
      orderBy: { date: 'asc' },
      include: { activities: { orderBy: { sortOrder: 'asc' } } },
    });
    for (const day of days) {
      const newDay = await tx.day.create({
        data: { tripId: newTrip.id, date: day.date },
      });
      for (const activity of day.activities) {
        const {
          id: _id,
          dayId: _dayId,
          updatedAt: _updatedAt,
          placeId,
          ...rest
        } = activity;
        await tx.activity.create({
          data: {
            ...rest,
            dayId: newDay.id,
            placeId: placeId ? (placeIdMap.get(placeId) ?? null) : null,
          },
        });
      }
    }

    const expenses = await tx.expense.findMany({
      where: { tripId: trip.id },
    });
    for (const expense of expenses) {
      const {
        id: _id,
        tripId: _tripId,
        updatedAt: _updatedAt,
        ...rest
      } = expense;
      await tx.expense.create({ data: { ...rest, tripId: newTrip.id } });
    }

    return newTrip;
  }, TRANSACTION_OPTIONS);
}
