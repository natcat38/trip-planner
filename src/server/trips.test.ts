import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import {
  currentUserId,
  requireTripAccess,
  requireTripOwner,
} from './auth-scope';
import { ValidationError, StaleWriteError } from './errors';
import { createTrip, deleteTrip, listTrips, updateTrip } from './trips';

vi.mock('./auth-scope', () => ({
  currentUserId: vi.fn(),
  requireTripAccess: vi.fn(),
  requireTripOwner: vi.fn(),
}));
vi.mock('../lib/db', () => ({
  db: {
    trip: {
      findMany: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.mocked(currentUserId).mockReset();
  vi.mocked(requireTripAccess).mockReset();
  vi.mocked(requireTripOwner).mockReset();
  vi.mocked(db.trip.findMany).mockReset();
  vi.mocked(db.trip.create).mockReset();
  vi.mocked(db.trip.updateMany).mockReset();
  vi.mocked(db.trip.delete).mockReset();
});

const validInput = {
  name: 'Japan Trip',
  destinations: ['Tokyo', 'Kyoto'],
  startDate: new Date('2026-09-01'),
  endDate: new Date('2026-09-05'),
  baseCurrency: 'JPY',
  budgetAmount: 350000,
};

describe('listTrips', () => {
  it("queries the current user's trips ordered by start date", async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(db.trip.findMany).mockResolvedValue([] as never);

    await listTrips();

    expect(db.trip.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { startDate: 'desc' },
    });
  });
});

describe('createTrip', () => {
  it('converts the budget amount to minor units for the trip currency', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(db.trip.create).mockResolvedValue({} as never);

    await createTrip(validInput);

    expect(db.trip.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        name: 'Japan Trip',
        destinations: ['Tokyo', 'Kyoto'],
        startDate: validInput.startDate,
        endDate: validInput.endDate,
        baseCurrency: 'JPY',
        budgetMinor: 350000,
      },
    });
  });

  it('rejects an end date before the start date', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');

    await expect(
      createTrip({
        ...validInput,
        startDate: new Date('2026-09-05'),
        endDate: new Date('2026-09-01'),
      }),
    ).rejects.toThrow(ValidationError);
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it('rejects a negative budget amount', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');

    await expect(
      createTrip({ ...validInput, budgetAmount: -1 }),
    ).rejects.toThrow(ValidationError);
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it('rejects a non-numeric budget amount', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');

    await expect(
      createTrip({ ...validInput, budgetAmount: NaN }),
    ).rejects.toThrow(ValidationError);
    expect(db.trip.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed currency code', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');

    await expect(
      createTrip({ ...validInput, baseCurrency: 'J' }),
    ).rejects.toThrow(ValidationError);
    expect(db.trip.create).not.toHaveBeenCalled();
  });
});

describe('updateTrip', () => {
  const lastSeenUpdatedAt = new Date('2026-07-01T00:00:00Z');

  it('updates the trip when the optimistic lock matches', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue({
      id: 'trip-1',
      userId: 'user-1',
    } as never);
    vi.mocked(db.trip.updateMany).mockResolvedValue({ count: 1 } as never);

    await updateTrip('trip-1', { ...validInput, updatedAt: lastSeenUpdatedAt });

    expect(db.trip.updateMany).toHaveBeenCalledWith({
      where: { id: 'trip-1', userId: 'user-1', updatedAt: lastSeenUpdatedAt },
      data: {
        name: 'Japan Trip',
        destinations: ['Tokyo', 'Kyoto'],
        startDate: validInput.startDate,
        endDate: validInput.endDate,
        baseCurrency: 'JPY',
        budgetMinor: 350000,
      },
    });
  });

  it('throws StaleWriteError when the row changed since it was last read', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue({
      id: 'trip-1',
      userId: 'user-1',
    } as never);
    vi.mocked(db.trip.updateMany).mockResolvedValue({ count: 0 } as never);

    await expect(
      updateTrip('trip-1', { ...validInput, updatedAt: lastSeenUpdatedAt }),
    ).rejects.toThrow(StaleWriteError);
  });

  it('rejects an end date before the start date without touching the db', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue({
      id: 'trip-1',
      userId: 'user-1',
    } as never);

    await expect(
      updateTrip('trip-1', {
        ...validInput,
        startDate: new Date('2026-09-05'),
        endDate: new Date('2026-09-01'),
        updatedAt: lastSeenUpdatedAt,
      }),
    ).rejects.toThrow(ValidationError);
    expect(db.trip.updateMany).not.toHaveBeenCalled();
  });
});

describe('deleteTrip', () => {
  it('deletes the trip after authorization', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue({
      id: 'trip-1',
      userId: 'user-1',
    } as never);
    vi.mocked(db.trip.delete).mockResolvedValue({} as never);

    await deleteTrip('trip-1');

    expect(requireTripOwner).toHaveBeenCalledWith('trip-1');
    expect(db.trip.delete).toHaveBeenCalledWith({ where: { id: 'trip-1' } });
  });
});
