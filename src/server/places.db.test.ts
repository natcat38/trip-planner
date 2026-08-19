import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import { Prisma } from '../generated/prisma/client';
import { ForbiddenOrNotFoundError } from './auth-scope';
import { addActivityFromPlace, listPlaces, savePlace } from './places';

// Real Postgres, only next-auth's session lookup stubbed — same rationale as itinerary.db.test.ts.
vi.mock('../auth', () => ({ auth: vi.fn() }));

let userId: string;
let tripId: string;

beforeEach(async () => {
  const user = await db.user.create({
    data: { email: `places-db-test-${crypto.randomUUID()}@example.com` },
  });
  userId = user.id;
  vi.mocked(auth).mockResolvedValue({ user: { id: userId } } as never);

  const trip = await db.trip.create({
    data: {
      userId,
      name: 'Japan Trip',
      destinations: ['Fukuoka'],
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-01'),
      baseCurrency: 'JPY',
      budgetMinor: 0,
    },
  });
  tripId = trip.id;
});

afterEach(async () => {
  await db.trip.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
});

describe('places against a real database', () => {
  it('cascade-deletes places when the parent trip is deleted', async () => {
    const place = await savePlace(tripId, {
      source: 'osm',
      sourceId: 'node/123',
      name: 'Ichiran Ramen',
      lat: 33.5904,
      lng: 130.4017,
      category: 'Food',
    });

    await db.trip.delete({ where: { id: tripId } });

    expect(await db.place.findUnique({ where: { id: place.id } })).toBeNull();
  });

  it('@@unique([tripId, source, sourceId]) blocks a duplicate raw insert', async () => {
    const data = {
      tripId,
      source: 'osm',
      sourceId: 'node/999',
      name: 'Fukuoka Tower',
      lat: 33.5933,
      lng: 130.3514,
      category: 'Sightseeing',
    };
    await db.place.create({ data });

    await expect(db.place.create({ data })).rejects.toBeInstanceOf(
      Prisma.PrismaClientKnownRequestError,
    );
  });

  it('savePlace tolerates re-saving the same OSM place instead of 500ing', async () => {
    const input = {
      source: 'osm',
      sourceId: 'node/555',
      name: 'Canal City',
      lat: 33.5898,
      lng: 130.4128,
      category: 'Sightseeing',
    };

    const first = await savePlace(tripId, input);
    const second = await savePlace(tripId, { ...input, notes: 'go at night' });

    expect(second.id).toBe(first.id);
    expect(second.notes).toBe('go at night');
    expect(
      await db.place.count({ where: { tripId, sourceId: 'node/555' } }),
    ).toBe(1);
  });

  it('a non-collaborator is denied on savePlace, listPlaces, and addActivityFromPlace', async () => {
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
      const otherPlace = await db.place.create({
        data: {
          tripId: otherTrip.id,
          source: 'manual',
          name: 'Secret spot',
          lat: 0,
          lng: 0,
          category: 'Other',
        },
      });

      // vi.mocked(auth) still resolves to the original (unprivileged) userId,
      // so every call below is "signed in as userId, reaching for otherTrip".
      await expect(
        savePlace(otherTrip.id, {
          source: 'manual',
          name: 'Sneaky',
          lat: 0,
          lng: 0,
          category: 'Other',
        }),
      ).rejects.toBeInstanceOf(ForbiddenOrNotFoundError);

      await expect(listPlaces(otherTrip.id)).rejects.toBeInstanceOf(
        ForbiddenOrNotFoundError,
      );

      await expect(
        addActivityFromPlace(otherTrip.id, otherPlace.id, otherDay.id),
      ).rejects.toBeInstanceOf(ForbiddenOrNotFoundError);
    } finally {
      await db.trip.deleteMany({ where: { userId: otherUser.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    }
  });
});
