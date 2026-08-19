import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { geocode } from '../lib/geocode';
import { searchPlaces as searchOsmPlaces } from '../lib/research/overpass';
import { ForbiddenOrNotFoundError, requireTripAccess } from './auth-scope';
import { StaleWriteError, ValidationError } from './errors';
import {
  addActivityFromPlace,
  deletePlace,
  listPlaces,
  requirePlace,
  savePlace,
  searchPlaces,
  updatePlace,
} from './places';

// Mocked as a plain factory (not importOriginal) so this never touches the real
// auth-scope.ts -> ../auth -> next-auth -> next/server chain — same rationale
// as itinerary.test.ts.
vi.mock('./auth-scope', () => {
  class ForbiddenOrNotFoundError extends Error {
    constructor() {
      super("That trip doesn't exist or you don't have access.");
    }
  }
  return { requireTripAccess: vi.fn(), ForbiddenOrNotFoundError };
});
vi.mock('../lib/db', () => ({
  db: {
    place: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
    day: { findFirst: vi.fn() },
    activity: {
      aggregate: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('../lib/geocode', () => ({ geocode: vi.fn() }));
vi.mock('../lib/research/overpass', () => ({ searchPlaces: vi.fn() }));

beforeEach(() => {
  vi.mocked(requireTripAccess).mockReset();
  vi.mocked(db.place.findFirst).mockReset();
  vi.mocked(db.place.findMany).mockReset();
  vi.mocked(db.place.create).mockReset();
  vi.mocked(db.place.upsert).mockReset();
  vi.mocked(db.place.updateMany).mockReset();
  vi.mocked(db.place.delete).mockReset();
  vi.mocked(db.day.findFirst).mockReset();
  vi.mocked(db.activity.aggregate).mockReset();
  vi.mocked(db.activity.create).mockReset();
  vi.mocked(db.activity.update).mockReset();
  vi.mocked(geocode).mockReset();
  vi.mocked(searchOsmPlaces).mockReset();
});

const trip = { id: 'trip-1', userId: 'user-1' };

const savedPlace = {
  id: 'place-1',
  tripId: 'trip-1',
  source: 'osm',
  sourceId: 'node/123',
  name: 'Ichiran Ramen',
  lat: 33.5904,
  lng: 130.4017,
  category: 'Food',
  cuisine: 'ramen',
  openingHours: null,
  website: null,
  phone: null,
  notes: null,
  costMinor: null,
  costCurrency: null,
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

describe('every exported function refuses when requireTripAccess rejects', () => {
  const denied = new ForbiddenOrNotFoundError();

  beforeEach(() => {
    vi.mocked(requireTripAccess).mockRejectedValue(denied);
  });

  it('requirePlace', async () => {
    await expect(requirePlace('trip-1', 'place-1')).rejects.toBe(denied);
    expect(db.place.findFirst).not.toHaveBeenCalled();
  });

  it('searchPlaces', async () => {
    await expect(
      searchPlaces('trip-1', { lat: 0, lng: 0, radius: 500 }),
    ).rejects.toBe(denied);
    expect(searchOsmPlaces).not.toHaveBeenCalled();
  });

  it('savePlace', async () => {
    await expect(
      savePlace('trip-1', {
        source: 'osm',
        sourceId: 'node/123',
        name: 'X',
        lat: 0,
        lng: 0,
        category: 'Food',
      }),
    ).rejects.toBe(denied);
    expect(db.place.create).not.toHaveBeenCalled();
    expect(db.place.upsert).not.toHaveBeenCalled();
  });

  it('updatePlace', async () => {
    await expect(
      updatePlace('trip-1', 'place-1', {
        name: 'X',
        category: 'Food',
        updatedAt: new Date(),
      }),
    ).rejects.toBe(denied);
    expect(db.place.updateMany).not.toHaveBeenCalled();
  });

  it('deletePlace', async () => {
    await expect(deletePlace('trip-1', 'place-1')).rejects.toBe(denied);
    expect(db.place.delete).not.toHaveBeenCalled();
  });

  it('listPlaces', async () => {
    await expect(listPlaces('trip-1')).rejects.toBe(denied);
    expect(db.place.findMany).not.toHaveBeenCalled();
  });

  it('addActivityFromPlace', async () => {
    await expect(
      addActivityFromPlace('trip-1', 'place-1', 'day-1'),
    ).rejects.toBe(denied);
    expect(db.activity.create).not.toHaveBeenCalled();
  });
});

describe('searchPlaces', () => {
  it('delegates to the Overpass lib after authorization', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(searchOsmPlaces).mockResolvedValue([]);

    const params = { lat: 33.59, lng: 130.4, radius: 1000, query: 'ramen' };
    const result = await searchPlaces('trip-1', params);

    expect(searchOsmPlaces).toHaveBeenCalledWith(params);
    expect(result).toEqual([]);
  });
});

describe('savePlace', () => {
  it('rejects a negative cost amount', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);

    await expect(
      savePlace('trip-1', {
        source: 'manual',
        name: 'X',
        lat: 0,
        lng: 0,
        category: 'Food',
        costAmount: -5,
        costCurrency: 'EUR',
      }),
    ).rejects.toThrow(ValidationError);
    expect(db.place.create).not.toHaveBeenCalled();
  });

  it('rejects a cost amount with no (or an invalid) currency', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);

    await expect(
      savePlace('trip-1', {
        source: 'manual',
        name: 'X',
        lat: 0,
        lng: 0,
        category: 'Food',
        costAmount: 10,
        costCurrency: '',
      }),
    ).rejects.toThrow(ValidationError);
    expect(db.place.create).not.toHaveBeenCalled();
  });

  it('converts an optional cost to minor units', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.place.create).mockResolvedValue({} as never);

    await savePlace('trip-1', {
      source: 'manual',
      name: 'Curry shop',
      lat: 0,
      lng: 0,
      category: 'Food',
      costAmount: 12.5,
      costCurrency: 'EUR',
    });

    expect(db.place.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ costMinor: 1250, costCurrency: 'EUR' }),
    });
  });

  it('upserts on the tripId/source/sourceId key when sourceId is present, tolerating a duplicate OSM save', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.place.upsert).mockResolvedValue(savedPlace as never);

    await savePlace('trip-1', {
      source: 'osm',
      sourceId: 'node/123',
      name: 'Ichiran Ramen',
      lat: 33.5904,
      lng: 130.4017,
      category: 'Food',
    });

    expect(db.place.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tripId_source_sourceId: {
            tripId: 'trip-1',
            source: 'osm',
            sourceId: 'node/123',
          },
        },
      }),
    );
    expect(db.place.create).not.toHaveBeenCalled();
  });

  it('creates directly for a manual place with no sourceId', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.place.create).mockResolvedValue({} as never);

    await savePlace('trip-1', {
      source: 'manual',
      name: 'My own find',
      lat: 1,
      lng: 2,
      category: 'Other',
    });

    expect(db.place.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tripId: 'trip-1',
        source: 'manual',
        sourceId: null,
      }),
    });
    expect(db.place.upsert).not.toHaveBeenCalled();
  });
});

describe('updatePlace', () => {
  const updatedAt = new Date('2026-08-01T00:00:00.000Z');

  it('rejects a bad currency code', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.place.findFirst).mockResolvedValue(savedPlace as never);

    await expect(
      updatePlace('trip-1', 'place-1', {
        name: 'Ichiran Ramen',
        category: 'Food',
        costAmount: 10,
        costCurrency: 'nope',
        updatedAt,
      }),
    ).rejects.toThrow(ValidationError);
    expect(db.place.updateMany).not.toHaveBeenCalled();
  });

  it('throws StaleWriteError when the place changed since it was read', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.place.findFirst).mockResolvedValue(savedPlace as never);
    vi.mocked(db.place.updateMany).mockResolvedValue({ count: 0 } as never);

    await expect(
      updatePlace('trip-1', 'place-1', {
        name: 'Ichiran Ramen',
        category: 'Food',
        updatedAt,
      }),
    ).rejects.toThrow(StaleWriteError);
  });

  it('updates the place after authorization', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.place.findFirst).mockResolvedValue(savedPlace as never);
    vi.mocked(db.place.updateMany).mockResolvedValue({ count: 1 } as never);

    await updatePlace('trip-1', 'place-1', {
      name: 'Ichiran Ramen (Nakasu)',
      category: 'Food',
      notes: 'always a queue after 7pm',
      updatedAt,
    });

    expect(db.place.updateMany).toHaveBeenCalledWith({
      where: { id: 'place-1', updatedAt },
      data: expect.objectContaining({
        name: 'Ichiran Ramen (Nakasu)',
        notes: 'always a queue after 7pm',
      }),
    });
  });
});

describe('deletePlace', () => {
  it('deletes the place after authorization', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.place.findFirst).mockResolvedValue(savedPlace as never);
    vi.mocked(db.place.delete).mockResolvedValue({} as never);

    await deletePlace('trip-1', 'place-1');

    expect(db.place.delete).toHaveBeenCalledWith({ where: { id: 'place-1' } });
  });

  it("throws ForbiddenOrNotFoundError when the place isn't scoped to the trip", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.place.findFirst).mockResolvedValue(null);

    await expect(deletePlace('trip-1', 'place-1')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});

describe('listPlaces', () => {
  it('lists the saved tray for the trip', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.place.findMany).mockResolvedValue([savedPlace] as never);

    const result = await listPlaces('trip-1');

    expect(db.place.findMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1' },
      orderBy: { createdAt: 'asc' },
    });
    expect(result).toEqual([savedPlace]);
  });
});

describe('addActivityFromPlace', () => {
  it('passes lat/lng through verbatim, does not geocode, and links the new activity to the place', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.place.findFirst).mockResolvedValue(savedPlace as never);
    vi.mocked(db.day.findFirst).mockResolvedValue({
      id: 'day-1',
      tripId: 'trip-1',
    } as never);
    vi.mocked(db.activity.aggregate).mockResolvedValue({
      _max: { sortOrder: null },
    } as never);
    vi.mocked(db.activity.create).mockResolvedValue({
      id: 'activity-1',
      lat: savedPlace.lat,
      lng: savedPlace.lng,
    } as never);
    vi.mocked(db.activity.update).mockResolvedValue({} as never);

    await addActivityFromPlace('trip-1', 'place-1', 'day-1');

    expect(geocode).not.toHaveBeenCalled();
    expect(db.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          placeName: savedPlace.name,
          lat: savedPlace.lat,
          lng: savedPlace.lng,
        }),
      }),
    );
    expect(db.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: { placeId: 'place-1' },
    });
  });

  it('maps a saved cost across to the new activity in the same currency', async () => {
    const pricedPlace = {
      ...savedPlace,
      costMinor: 1250,
      costCurrency: 'EUR',
    };
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.place.findFirst).mockResolvedValue(pricedPlace as never);
    vi.mocked(db.day.findFirst).mockResolvedValue({
      id: 'day-1',
      tripId: 'trip-1',
    } as never);
    vi.mocked(db.activity.aggregate).mockResolvedValue({
      _max: { sortOrder: null },
    } as never);
    vi.mocked(db.activity.create).mockResolvedValue({
      id: 'activity-1',
    } as never);
    vi.mocked(db.activity.update).mockResolvedValue({} as never);

    await addActivityFromPlace('trip-1', 'place-1', 'day-1');

    expect(db.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          costMinor: 1250,
          costCurrency: 'EUR',
        }),
      }),
    );
  });

  it("throws ForbiddenOrNotFoundError when the place isn't scoped to the trip", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.place.findFirst).mockResolvedValue(null);

    await expect(
      addActivityFromPlace('trip-1', 'place-1', 'day-1'),
    ).rejects.toBeInstanceOf(ForbiddenOrNotFoundError);
    expect(db.activity.create).not.toHaveBeenCalled();
  });
});
