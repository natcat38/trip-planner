'use server';

import { db } from '../lib/db';
import { toMinorUnits } from '../lib/money';
import { currentUserId, requireTrip } from './auth-scope';
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
  const trip = await requireTrip(tripId);
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
  const trip = await requireTrip(tripId);
  await db.trip.delete({ where: { id: trip.id } });
}
