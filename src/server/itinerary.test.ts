import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { geocode } from '../lib/geocode';
import { ForbiddenOrNotFoundError, requireTripAccess } from './auth-scope';
import { StaleWriteError, ValidationError } from './errors';
import {
  createActivity,
  deleteActivity,
  ensureDaysForTrip,
  moveActivity,
  setActivityPinColor,
  updateActivity,
  updateDayNotes,
} from './itinerary';

// Mocked as a plain factory (not importOriginal) so this never touches the real
// auth-scope.ts -> ../auth -> next-auth -> next/server chain, which fails to
// resolve outside Next's own build pipeline.
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
    day: {
      findMany: vi.fn(),
      createMany: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
    activity: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      aggregate: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));
vi.mock('../lib/geocode', () => ({ geocode: vi.fn() }));

beforeEach(() => {
  vi.mocked(requireTripAccess).mockReset();
  vi.mocked(db.day.findMany).mockReset();
  vi.mocked(db.day.createMany).mockReset();
  vi.mocked(db.day.findFirst).mockReset();
  vi.mocked(db.day.updateMany).mockReset();
  vi.mocked(db.activity.findFirst).mockReset();
  vi.mocked(db.activity.findMany).mockReset();
  vi.mocked(db.activity.create).mockReset();
  vi.mocked(db.activity.update).mockReset();
  vi.mocked(db.activity.updateMany).mockReset();
  vi.mocked(db.activity.delete).mockReset();
  vi.mocked(db.activity.aggregate).mockReset();
  vi.mocked(db.$transaction).mockReset();
  vi.mocked(geocode).mockReset();
});

const trip = {
  id: 'trip-1',
  userId: 'user-1',
  startDate: new Date('2026-09-01'),
  endDate: new Date('2026-09-03'),
};

describe('ensureDaysForTrip', () => {
  it('creates the missing days for the trip range', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findMany)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never);

    await ensureDaysForTrip('trip-1');

    expect(db.day.createMany).toHaveBeenCalledWith({
      data: [
        { tripId: 'trip-1', date: new Date('2026-09-01') },
        { tripId: 'trip-1', date: new Date('2026-09-02') },
        { tripId: 'trip-1', date: new Date('2026-09-03') },
      ],
    });
  });

  it('is a no-op when all days already exist', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    const existing = [
      { date: new Date('2026-09-01') },
      { date: new Date('2026-09-02') },
      { date: new Date('2026-09-03') },
    ];
    vi.mocked(db.day.findMany)
      .mockResolvedValueOnce(existing as never)
      .mockResolvedValueOnce(existing as never);

    await ensureDaysForTrip('trip-1');

    expect(db.day.createMany).not.toHaveBeenCalled();
  });
});

describe('updateDayNotes', () => {
  const day = { id: 'day-1', tripId: 'trip-1' };
  const updatedAt = new Date('2026-08-01T00:00:00.000Z');

  it('refuses when requireTripAccess rejects', async () => {
    const denied = new ForbiddenOrNotFoundError();
    vi.mocked(requireTripAccess).mockRejectedValue(denied);

    await expect(
      updateDayNotes('trip-1', 'day-1', 'bring an umbrella', updatedAt),
    ).rejects.toBe(denied);
    expect(db.day.updateMany).not.toHaveBeenCalled();
  });

  it('updates the notes after authorization', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);
    vi.mocked(db.day.updateMany).mockResolvedValue({ count: 1 } as never);

    await updateDayNotes('trip-1', 'day-1', 'bring an umbrella', updatedAt);

    expect(db.day.updateMany).toHaveBeenCalledWith({
      where: { id: 'day-1', updatedAt },
      data: { notes: 'bring an umbrella' },
    });
  });

  it('stores null for an empty notes string', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);
    vi.mocked(db.day.updateMany).mockResolvedValue({ count: 1 } as never);

    await updateDayNotes('trip-1', 'day-1', '', updatedAt);

    expect(db.day.updateMany).toHaveBeenCalledWith({
      where: { id: 'day-1', updatedAt },
      data: { notes: null },
    });
  });

  it('throws StaleWriteError when the day changed since it was read', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);
    vi.mocked(db.day.updateMany).mockResolvedValue({ count: 0 } as never);

    await expect(
      updateDayNotes('trip-1', 'day-1', 'bring an umbrella', updatedAt),
    ).rejects.toThrow(StaleWriteError);
  });

  it("throws ForbiddenOrNotFoundError when the day doesn't belong to the trip", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(null);

    await expect(
      updateDayNotes('trip-1', 'day-1', 'bring an umbrella', updatedAt),
    ).rejects.toBeInstanceOf(ForbiddenOrNotFoundError);
  });
});

describe('createActivity', () => {
  const day = { id: 'day-1', tripId: 'trip-1' };

  it('assigns the next sortOrder and creates the activity', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);
    vi.mocked(db.activity.aggregate).mockResolvedValue({
      _max: { sortOrder: 1 },
    } as never);
    vi.mocked(db.activity.create).mockResolvedValue({} as never);

    await createActivity('trip-1', 'day-1', {
      title: 'Lunch',
      category: 'Food',
    });

    expect(db.activity.create).toHaveBeenCalledWith({
      data: {
        dayId: 'day-1',
        title: 'Lunch',
        placeName: null,
        lat: null,
        lng: null,
        startTime: null,
        endTime: null,
        category: 'Food',
        notes: null,
        costMinor: null,
        costCurrency: null,
        sortOrder: 2,
      },
    });
    expect(geocode).not.toHaveBeenCalled();
  });

  it('geocodes a provided placeName and stores the resulting lat/lng', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);
    vi.mocked(db.activity.aggregate).mockResolvedValue({
      _max: { sortOrder: null },
    } as never);
    vi.mocked(db.activity.create).mockResolvedValue({} as never);
    vi.mocked(geocode).mockResolvedValue({ lat: 35.6586, lng: 139.7454 });

    await createActivity('trip-1', 'day-1', {
      title: 'Tokyo Tower',
      category: 'Sightseeing',
      placeName: 'Tokyo Tower',
    });

    expect(geocode).toHaveBeenCalledWith('Tokyo Tower');
    expect(db.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lat: 35.6586, lng: 139.7454 }),
      }),
    );
  });

  it('regression: geocodes as before when no lat/lng are supplied', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);
    vi.mocked(db.activity.aggregate).mockResolvedValue({
      _max: { sortOrder: null },
    } as never);
    vi.mocked(db.activity.create).mockResolvedValue({} as never);
    vi.mocked(geocode).mockResolvedValue({ lat: 35.6586, lng: 139.7454 });

    await createActivity('trip-1', 'day-1', {
      title: 'Tokyo Tower',
      category: 'Sightseeing',
      placeName: 'Tokyo Tower',
    });

    expect(geocode).toHaveBeenCalledWith('Tokyo Tower');
    expect(db.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lat: 35.6586, lng: 139.7454 }),
      }),
    );
  });

  it('uses supplied lat/lng verbatim and does not geocode', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);
    vi.mocked(db.activity.aggregate).mockResolvedValue({
      _max: { sortOrder: null },
    } as never);
    vi.mocked(db.activity.create).mockResolvedValue({} as never);

    await createActivity('trip-1', 'day-1', {
      title: 'Tokyo Tower',
      category: 'Sightseeing',
      placeName: 'Tokyo Tower',
      lat: 35.6586,
      lng: 139.7454,
    });

    expect(geocode).not.toHaveBeenCalled();
    expect(db.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lat: 35.6586, lng: 139.7454 }),
      }),
    );
  });

  it('falls back to geocoding when only one of lat/lng is supplied', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);
    vi.mocked(db.activity.aggregate).mockResolvedValue({
      _max: { sortOrder: null },
    } as never);
    vi.mocked(db.activity.create).mockResolvedValue({} as never);
    vi.mocked(geocode).mockResolvedValue({ lat: 35.6586, lng: 139.7454 });

    await createActivity('trip-1', 'day-1', {
      title: 'Tokyo Tower',
      category: 'Sightseeing',
      placeName: 'Tokyo Tower',
      lat: 35.6586,
    });

    expect(geocode).toHaveBeenCalledWith('Tokyo Tower');
    expect(db.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lat: 35.6586, lng: 139.7454 }),
      }),
    );
  });

  it('honours supplied lat/lng even when there is no placeName', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);
    vi.mocked(db.activity.aggregate).mockResolvedValue({
      _max: { sortOrder: null },
    } as never);
    vi.mocked(db.activity.create).mockResolvedValue({} as never);

    // A blank placeName leaves placeName === null, which matches the "no
    // existing place" default — so gating the passthrough on that comparison
    // used to drop the coordinates silently and lose the pin.
    await createActivity('trip-1', 'day-1', {
      title: 'Picnic spot',
      category: 'Other',
      lat: 35.6586,
      lng: 139.7454,
    });

    expect(geocode).not.toHaveBeenCalled();
    expect(db.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lat: 35.6586, lng: 139.7454 }),
      }),
    );
  });

  it('stores null lat/lng when geocoding finds nothing, without throwing', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);
    vi.mocked(db.activity.aggregate).mockResolvedValue({
      _max: { sortOrder: null },
    } as never);
    vi.mocked(db.activity.create).mockResolvedValue({} as never);
    vi.mocked(geocode).mockResolvedValue(null);

    await createActivity('trip-1', 'day-1', {
      title: 'Somewhere',
      category: 'Other',
      placeName: 'asdkjfhaslkdjfh',
    });

    expect(db.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lat: null, lng: null }),
      }),
    );
  });

  it('converts an optional cost to minor units', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);
    vi.mocked(db.activity.aggregate).mockResolvedValue({
      _max: { sortOrder: null },
    } as never);
    vi.mocked(db.activity.create).mockResolvedValue({} as never);

    await createActivity('trip-1', 'day-1', {
      title: 'Dinner',
      category: 'Food',
      costAmount: 60,
      costCurrency: 'EUR',
    });

    expect(db.activity.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ costMinor: 6000, costCurrency: 'EUR' }),
      }),
    );
  });

  it('rejects a negative cost amount', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);

    await expect(
      createActivity('trip-1', 'day-1', {
        title: 'Dinner',
        category: 'Food',
        costAmount: -5,
        costCurrency: 'EUR',
      }),
    ).rejects.toThrow(ValidationError);
    expect(db.activity.create).not.toHaveBeenCalled();
  });

  it('rejects a cost amount with no (or an invalid) currency', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(day as never);

    await expect(
      createActivity('trip-1', 'day-1', {
        title: 'Dinner',
        category: 'Food',
        costAmount: 60,
        costCurrency: '',
      }),
    ).rejects.toThrow(ValidationError);
    expect(db.activity.create).not.toHaveBeenCalled();
  });

  it("throws ForbiddenOrNotFoundError when the day doesn't belong to the trip", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.day.findFirst).mockResolvedValue(null);

    await expect(
      createActivity('trip-1', 'day-1', { title: 'Lunch', category: 'Food' }),
    ).rejects.toBeInstanceOf(ForbiddenOrNotFoundError);
  });
});

describe('updateActivity and deleteActivity', () => {
  const activity = {
    id: 'activity-1',
    dayId: 'day-1',
    placeName: null,
    lat: null,
    lng: null,
  };

  const updatedAt = new Date('2026-08-01T00:00:00.000Z');

  it('updates the activity after authorization', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(activity as never);
    vi.mocked(db.activity.updateMany).mockResolvedValue({ count: 1 } as never);

    await updateActivity('trip-1', 'activity-1', {
      title: 'Renamed',
      category: 'Sightseeing',
      updatedAt,
    });

    expect(db.activity.updateMany).toHaveBeenCalledWith({
      where: { id: 'activity-1', updatedAt },
      data: expect.objectContaining({
        title: 'Renamed',
        category: 'Sightseeing',
      }),
    });
  });

  it('throws StaleWriteError when the activity changed since it was read', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(activity as never);
    vi.mocked(db.activity.updateMany).mockResolvedValue({ count: 0 } as never);

    await expect(
      updateActivity('trip-1', 'activity-1', {
        title: 'Renamed',
        category: 'Sightseeing',
        updatedAt,
      }),
    ).rejects.toThrow(StaleWriteError);
  });

  it('does not re-geocode when placeName is unchanged, keeping the existing lat/lng', async () => {
    const withPlace = {
      id: 'activity-1',
      dayId: 'day-1',
      placeName: 'Tokyo Tower',
      lat: 35.6586,
      lng: 139.7454,
    };
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(withPlace as never);
    vi.mocked(db.activity.updateMany).mockResolvedValue({ count: 1 } as never);

    await updateActivity('trip-1', 'activity-1', {
      title: 'Renamed',
      category: 'Sightseeing',
      placeName: 'Tokyo Tower',
      updatedAt,
    });

    expect(geocode).not.toHaveBeenCalled();
    expect(db.activity.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lat: 35.6586, lng: 139.7454 }),
      }),
    );
  });

  it('re-geocodes when placeName changes', async () => {
    const withPlace = {
      id: 'activity-1',
      dayId: 'day-1',
      placeName: 'Tokyo Tower',
      lat: 35.6586,
      lng: 139.7454,
    };
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(withPlace as never);
    vi.mocked(db.activity.updateMany).mockResolvedValue({ count: 1 } as never);
    vi.mocked(geocode).mockResolvedValue({ lat: 35.71, lng: 139.81 });

    await updateActivity('trip-1', 'activity-1', {
      title: 'Renamed',
      category: 'Sightseeing',
      placeName: 'Senso-ji',
      updatedAt,
    });

    expect(geocode).toHaveBeenCalledWith('Senso-ji');
    expect(db.activity.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lat: 35.71, lng: 139.81 }),
      }),
    );
  });

  it('deletes the activity after authorization', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(activity as never);
    vi.mocked(db.activity.delete).mockResolvedValue({} as never);

    await deleteActivity('trip-1', 'activity-1');

    expect(db.activity.delete).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
    });
  });

  it("throws ForbiddenOrNotFoundError when the activity isn't scoped to the trip", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(null);

    await expect(deleteActivity('trip-1', 'activity-1')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});

describe('setActivityPinColor', () => {
  const activity = { id: 'activity-1', dayId: 'day-1' };

  it('refuses when requireTripAccess (via requireActivity) rejects', async () => {
    const denied = new ForbiddenOrNotFoundError();
    vi.mocked(requireTripAccess).mockRejectedValue(denied);

    await expect(
      setActivityPinColor('trip-1', 'activity-1', '#e11d48'),
    ).rejects.toBe(denied);
    expect(db.activity.update).not.toHaveBeenCalled();
  });

  it('accepts a 6-digit hex colour and persists it', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(activity as never);
    vi.mocked(db.activity.update).mockResolvedValue({} as never);

    await setActivityPinColor('trip-1', 'activity-1', '#e11d48');

    expect(db.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: { pinColor: '#e11d48' },
    });
  });

  it('accepts a 3-digit hex colour', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(activity as never);
    vi.mocked(db.activity.update).mockResolvedValue({} as never);

    await setActivityPinColor('trip-1', 'activity-1', '#abc');

    expect(db.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: { pinColor: '#abc' },
    });
  });

  it('accepts null to clear back to the map default', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(activity as never);
    vi.mocked(db.activity.update).mockResolvedValue({} as never);

    await setActivityPinColor('trip-1', 'activity-1', null);

    expect(db.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: { pinColor: null },
    });
  });

  // The injection guard: this string reaches Map.tsx's marker style.background
  // verbatim if it isn't rejected here, so it must fail closed with no write.
  it('rejects a non-hex string with ValidationError and writes nothing', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(activity as never);

    await expect(
      setActivityPinColor('trip-1', 'activity-1', 'red; background:url(x)'),
    ).rejects.toThrow(ValidationError);
    expect(db.activity.update).not.toHaveBeenCalled();
  });

  it('rejects a colour missing the leading #', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(activity as never);

    await expect(
      setActivityPinColor('trip-1', 'activity-1', 'e11d48'),
    ).rejects.toThrow(ValidationError);
    expect(db.activity.update).not.toHaveBeenCalled();
  });

  it('rejects an empty string rather than treating it as "clear"', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(activity as never);

    await expect(
      setActivityPinColor('trip-1', 'activity-1', ''),
    ).rejects.toThrow(ValidationError);
    expect(db.activity.update).not.toHaveBeenCalled();
  });
});

describe('moveActivity', () => {
  const activity = { id: 'activity-2', dayId: 'day-1', sortOrder: 1 };
  const siblings = [
    { id: 'activity-1', dayId: 'day-1', sortOrder: 0 },
    { id: 'activity-2', dayId: 'day-1', sortOrder: 1 },
    { id: 'activity-3', dayId: 'day-1', sortOrder: 2 },
  ];

  it('swaps sortOrder with the previous sibling when moving up', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(activity as never);
    vi.mocked(db.activity.findMany).mockResolvedValue(siblings as never);
    vi.mocked(db.$transaction).mockResolvedValue([] as never);

    await moveActivity('trip-1', 'activity-2', 'up');

    expect(db.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-2' },
      data: { sortOrder: 0 },
    });
    expect(db.activity.update).toHaveBeenCalledWith({
      where: { id: 'activity-1' },
      data: { sortOrder: 1 },
    });
    expect(db.$transaction).toHaveBeenCalledTimes(1);
  });

  it('is a no-op at the top boundary', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findFirst).mockResolvedValue(siblings[0] as never);
    vi.mocked(db.activity.findMany).mockResolvedValue(siblings as never);

    await moveActivity('trip-1', 'activity-1', 'up');

    expect(db.$transaction).not.toHaveBeenCalled();
  });
});
