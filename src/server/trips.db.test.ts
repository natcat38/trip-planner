import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import { StaleWriteError } from './errors';
import { createTrip, listTrips, updateTrip } from './trips';

// Hits the real local Postgres (docker-compose) to verify behavior a mocked
// db can't: Postgres's actual optimistic-lock semantics, cascade deletes,
// and unique/FK constraints. Only next-auth's session lookup is stubbed —
// currentUserId/requireTrip run for real against the real db.
vi.mock('../auth', () => ({ auth: vi.fn() }));

let userId: string;

beforeEach(async () => {
  const user = await db.user.create({
    data: { email: `trips-db-test-${crypto.randomUUID()}@example.com` },
  });
  userId = user.id;
  vi.mocked(auth).mockResolvedValue({ user: { id: userId } } as never);
});

afterEach(async () => {
  await db.trip.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
});

const validInput = {
  name: 'Japan Trip',
  destinations: ['Tokyo', 'Kyoto'],
  startDate: new Date('2026-09-01'),
  endDate: new Date('2026-09-05'),
  baseCurrency: 'JPY',
  budgetAmount: 350000,
};

describe('trips against a real database', () => {
  it('creates and lists a trip scoped to the current user', async () => {
    await createTrip(validInput);

    const trips = await listTrips();
    expect(trips).toHaveLength(1);
    expect(trips[0].name).toBe('Japan Trip');
    expect(trips[0].budgetMinor).toBe(350000);
  });

  it('cascade-deletes days/activities/expenses when a trip is deleted', async () => {
    const trip = await createTrip(validInput);
    const day = await db.day.create({
      data: { tripId: trip.id, date: validInput.startDate },
    });
    await db.activity.create({
      data: {
        dayId: day.id,
        title: 'Arrive',
        category: 'Transport',
        sortOrder: 0,
      },
    });
    await db.expense.create({
      data: {
        tripId: trip.id,
        label: 'Flights',
        category: 'Transport',
        costMinor: 1000000,
        costCurrency: 'JPY',
      },
    });

    await db.trip.delete({ where: { id: trip.id } });

    expect(await db.day.findMany({ where: { tripId: trip.id } })).toHaveLength(
      0,
    );
    expect(
      await db.expense.findMany({ where: { tripId: trip.id } }),
    ).toHaveLength(0);
  });

  it('rejects a stale update once the row has actually changed', async () => {
    const trip = await createTrip(validInput);

    // Someone else updates the trip first, advancing its real updatedAt.
    await db.trip.update({
      where: { id: trip.id },
      data: { name: 'Renamed elsewhere' },
    });

    await expect(
      updateTrip(trip.id, { ...validInput, updatedAt: trip.updatedAt }),
    ).rejects.toBeInstanceOf(StaleWriteError);
  });

  it('applies an update when the optimistic lock is current', async () => {
    const trip = await createTrip(validInput);

    await updateTrip(trip.id, {
      ...validInput,
      name: 'Renamed',
      updatedAt: trip.updatedAt,
    });

    const updated = await db.trip.findUniqueOrThrow({ where: { id: trip.id } });
    expect(updated.name).toBe('Renamed');
  });

  it("rejects requireTrip-gated access to another user's trip", async () => {
    const otherUser = await db.user.create({
      data: { email: `other-${crypto.randomUUID()}@example.com` },
    });
    try {
      const otherTrip = await db.trip.create({
        data: {
          userId: otherUser.id,
          name: 'Not yours',
          destinations: [],
          startDate: validInput.startDate,
          endDate: validInput.endDate,
          baseCurrency: 'JPY',
          budgetMinor: 0,
        },
      });

      await expect(
        updateTrip(otherTrip.id, {
          ...validInput,
          updatedAt: otherTrip.updatedAt,
        }),
      ).rejects.toThrow("doesn't exist or you don't have access");
    } finally {
      await db.trip.deleteMany({ where: { userId: otherUser.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    }
  });
});
