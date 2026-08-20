import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import { StaleWriteError } from './errors';
import { createTrip, duplicateTrip, listTrips, updateTrip } from './trips';

// Hits the real local Postgres (docker-compose) to verify behavior a mocked
// db can't: Postgres's actual optimistic-lock semantics, cascade deletes,
// and unique/FK constraints. Only next-auth's session lookup is stubbed —
// currentUserId/requireTripAccess/requireTripOwner run for real against the real db.
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

describe('duplicateTrip against a real database', () => {
  async function withOtherUser<T>(
    fn: (otherUserId: string, otherEmail: string) => Promise<T>,
  ): Promise<T> {
    const otherUser = await db.user.create({
      data: { email: `dup-${crypto.randomUUID()}@example.com` },
    });
    try {
      return await fn(otherUser.id, otherUser.email);
    } finally {
      // Cascades to the copied trip's days/activities/places/expenses too —
      // Trip's child relations are all onDelete: Cascade.
      await db.trip.deleteMany({ where: { userId: otherUser.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    }
  }

  it('copies the trip to a new trip owned by the current user, not the original owner', () =>
    withOtherUser(async (otherUserId, otherEmail) => {
      const trip = await createTrip(validInput);
      // otherUser needs access to duplicate — grant it as an accepted
      // collaborator, same authorization path any nested read would use.
      await db.tripCollaborator.create({
        data: { tripId: trip.id, email: otherEmail, status: 'ACCEPTED' },
      });
      vi.mocked(auth).mockResolvedValue({
        user: { id: otherUserId, email: otherEmail },
      } as never);

      const newTrip = await duplicateTrip(trip.id);

      expect(newTrip.id).not.toBe(trip.id);
      expect(newTrip.userId).toBe(otherUserId);
      expect(newTrip.userId).not.toBe(userId);
      expect(newTrip.name).toBe('Japan Trip (copy)');
      expect(newTrip.destinations).toEqual(validInput.destinations);
      expect(newTrip.baseCurrency).toBe('JPY');
      expect(newTrip.budgetMinor).toBe(350000);
    }));

  it('refuses to duplicate a trip the current user cannot access', () =>
    withOtherUser(async (otherUserId, otherEmail) => {
      const trip = await createTrip(validInput);
      // No collaborator grant this time — otherUser has no access at all.
      vi.mocked(auth).mockResolvedValue({
        user: { id: otherUserId, email: otherEmail },
      } as never);

      await expect(duplicateTrip(trip.id)).rejects.toThrow(
        "doesn't exist or you don't have access",
      );
    }));

  it('never copies the share token, even when the original trip is shared', async () => {
    const trip = await createTrip(validInput);
    await db.trip.update({
      where: { id: trip.id },
      data: { shareToken: `tok-${crypto.randomUUID()}` },
    });

    const newTrip = await duplicateTrip(trip.id);

    expect(newTrip.shareToken).toBeNull();
  });

  it('never copies collaborators, even when the original trip had them', async () => {
    const trip = await createTrip(validInput);
    await db.tripCollaborator.create({
      data: {
        tripId: trip.id,
        email: `collab-${crypto.randomUUID()}@example.com`,
        status: 'ACCEPTED',
      },
    });

    const newTrip = await duplicateTrip(trip.id);

    const collaborators = await db.tripCollaborator.findMany({
      where: { tripId: newTrip.id },
    });
    expect(collaborators).toHaveLength(0);
  });

  it('copies days and activities with the right counts and preserves ordering', async () => {
    const trip = await createTrip(validInput);
    const day1 = await db.day.create({
      data: { tripId: trip.id, date: new Date('2026-09-01') },
    });
    const day2 = await db.day.create({
      data: { tripId: trip.id, date: new Date('2026-09-02') },
    });
    await db.activity.create({
      data: { dayId: day1.id, title: 'Ramen', category: 'Food', sortOrder: 0 },
    });
    await db.activity.create({
      data: {
        dayId: day1.id,
        title: 'Temple',
        category: 'Sightseeing',
        sortOrder: 1,
      },
    });
    await db.activity.create({
      data: {
        dayId: day2.id,
        title: 'Museum',
        category: 'Sightseeing',
        sortOrder: 0,
      },
    });

    const newTrip = await duplicateTrip(trip.id);
    const newDays = await db.day.findMany({
      where: { tripId: newTrip.id },
      orderBy: { date: 'asc' },
      include: { activities: { orderBy: { sortOrder: 'asc' } } },
    });

    expect(newDays).toHaveLength(2);
    expect(newDays[0].activities.map((a) => a.title)).toEqual([
      'Ramen',
      'Temple',
    ]);
    expect(newDays[1].activities.map((a) => a.title)).toEqual(['Museum']);
  });

  it("repoints a copied activity's placeId at the COPIED place, not the original", async () => {
    const trip = await createTrip(validInput);
    const place = await db.place.create({
      data: {
        tripId: trip.id,
        source: 'manual',
        name: 'Ichiran',
        lat: 1,
        lng: 2,
        category: 'Food',
      },
    });
    const day = await db.day.create({
      data: { tripId: trip.id, date: new Date('2026-09-01') },
    });
    await db.activity.create({
      data: {
        dayId: day.id,
        title: 'Ramen',
        category: 'Food',
        sortOrder: 0,
        placeId: place.id,
      },
    });

    const newTrip = await duplicateTrip(trip.id);
    const newPlaces = await db.place.findMany({
      where: { tripId: newTrip.id },
    });
    const [newDay] = await db.day.findMany({
      where: { tripId: newTrip.id },
      include: { activities: true },
    });

    expect(newPlaces).toHaveLength(1);
    expect(newPlaces[0].id).not.toBe(place.id);

    const [copiedActivity] = newDay.activities;
    expect(copiedActivity.placeId).not.toBeNull();
    expect(copiedActivity.placeId).not.toBe(place.id);
    expect(copiedActivity.placeId).toBe(newPlaces[0].id);
  });
});
