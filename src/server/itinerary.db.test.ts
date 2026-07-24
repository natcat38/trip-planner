import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import { ForbiddenOrNotFoundError } from './auth-scope';
import {
  createActivity,
  deleteActivity,
  ensureDaysForTrip,
  moveActivity,
  updateActivity,
} from './itinerary';

// Real Postgres, only next-auth's session lookup stubbed — same rationale as trips.db.test.ts.
vi.mock('../auth', () => ({ auth: vi.fn() }));

let userId: string;
let tripId: string;

beforeEach(async () => {
  const user = await db.user.create({
    data: { email: `itinerary-db-test-${crypto.randomUUID()}@example.com` },
  });
  userId = user.id;
  vi.mocked(auth).mockResolvedValue({ user: { id: userId } } as never);

  const trip = await db.trip.create({
    data: {
      userId,
      name: 'Japan Trip',
      destinations: ['Tokyo'],
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-03'),
      baseCurrency: 'JPY',
      budgetMinor: 0,
    },
  });
  tripId = trip.id;
});

afterEach(async () => {
  await db.trip.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
  vi.unstubAllGlobals();
});

describe('itinerary against a real database', () => {
  it('generates one day per date in the trip range and stays idempotent', async () => {
    const days = await ensureDaysForTrip(tripId);
    expect(days).toHaveLength(3);
    expect(days.map((d) => d.date.toISOString().slice(0, 10))).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);

    const daysAgain = await ensureDaysForTrip(tripId);
    expect(daysAgain).toHaveLength(3);
    expect(daysAgain.map((d) => d.id).sort()).toEqual(
      days.map((d) => d.id).sort(),
    );
  });

  it('assigns increasing real sortOrder values and reorders on move', async () => {
    const [day] = await ensureDaysForTrip(tripId);

    const first = await createActivity(tripId, day.id, {
      title: 'Breakfast',
      category: 'Food',
    });
    const second = await createActivity(tripId, day.id, {
      title: 'Museum',
      category: 'Sightseeing',
    });
    expect(first.sortOrder).toBe(0);
    expect(second.sortOrder).toBe(1);

    await moveActivity(tripId, second.id, 'up');

    const reordered = await db.activity.findMany({
      where: { dayId: day.id },
      orderBy: { sortOrder: 'asc' },
    });
    expect(reordered.map((a) => a.title)).toEqual(['Museum', 'Breakfast']);
  });

  it("rejects creating an activity under another user's day", async () => {
    const otherUser = await db.user.create({
      data: { email: `other-${crypto.randomUUID()}@example.com` },
    });
    try {
      const otherTrip = await db.trip.create({
        data: {
          userId: otherUser.id,
          name: 'Not yours',
          destinations: [],
          startDate: new Date('2026-09-01'),
          endDate: new Date('2026-09-01'),
          baseCurrency: 'JPY',
          budgetMinor: 0,
        },
      });
      const otherDay = await db.day.create({
        data: { tripId: otherTrip.id, date: new Date('2026-09-01') },
      });

      await expect(
        createActivity(tripId, otherDay.id, {
          title: 'Sneaky',
          category: 'Food',
        }),
      ).rejects.toBeInstanceOf(ForbiddenOrNotFoundError);
    } finally {
      await db.trip.deleteMany({ where: { userId: otherUser.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    }
  });

  it('cascade-deletes when the parent trip is deleted, and deleteActivity removes just one row', async () => {
    const [day] = await ensureDaysForTrip(tripId);
    const activity = await createActivity(tripId, day.id, {
      title: 'Lunch',
      category: 'Food',
    });

    await deleteActivity(tripId, activity.id);
    expect(
      await db.activity.findUnique({ where: { id: activity.id } }),
    ).toBeNull();

    await createActivity(tripId, day.id, { title: 'Dinner', category: 'Food' });
    await db.trip.delete({ where: { id: tripId } });
    expect(
      await db.activity.findMany({ where: { dayId: day.id } }),
    ).toHaveLength(0);
  });

  it('geocodes and persists real lat/lng when a placeName is set, and skips re-geocoding on an unrelated edit', async () => {
    process.env.MAPBOX_TOKEN = 'test-token';
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [{ properties: { coordinates: { longitude: 139.7454, latitude: 35.6586 } } }],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const [day] = await ensureDaysForTrip(tripId);
    const activity = await createActivity(tripId, day.id, {
      title: 'Tokyo Tower',
      category: 'Sightseeing',
      placeName: 'Tokyo Tower',
    });
    expect(activity.lat).toBe(35.6586);
    expect(activity.lng).toBe(139.7454);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await updateActivity(tripId, activity.id, {
      title: 'Tokyo Tower (renamed)',
      category: 'Sightseeing',
      placeName: 'Tokyo Tower',
    });

    const reloaded = await db.activity.findUniqueOrThrow({ where: { id: activity.id } });
    expect(reloaded.lat).toBe(35.6586);
    expect(reloaded.lng).toBe(139.7454);
    expect(fetchMock).toHaveBeenCalledTimes(1); // no re-fetch since placeName didn't change
  });
});
