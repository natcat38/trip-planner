import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import {
  currentUserId,
  currentUserIdentity,
  ForbiddenOrNotFoundError,
  requireTripAccess,
  requireTripOwner,
} from './auth-scope';
import { ValidationError, StaleWriteError } from './errors';
import {
  createTrip,
  deleteTrip,
  duplicateTrip,
  listTrips,
  updateTrip,
} from './trips';

vi.mock('./auth-scope', async () => {
  // Mirrors auth-scope.ts's real ForbiddenOrNotFoundError shape without
  // importing the real module, which pulls in next-auth (and, transitively,
  // next/server) — not resolvable in this unit-test environment. The real
  // module is exercised instead by trips.db.test.ts against a live db.
  class ForbiddenOrNotFoundError extends Error {
    constructor() {
      super("That trip doesn't exist or you don't have access.");
    }
  }
  // tripAccessWhere is the REAL implementation (from trip-access-where.ts,
  // which has no auth/db imports and is safe to load here) rather than a
  // second copy reimplemented in this factory — a reimplementation only
  // proves the mock agrees with itself, not that listTrips still builds the
  // real access predicate.
  const { tripAccessWhere } = await vi.importActual<
    typeof import('./trip-access-where')
  >('./trip-access-where');
  return {
    ForbiddenOrNotFoundError,
    currentUserId: vi.fn(),
    currentUserIdentity: vi.fn(),
    requireTripAccess: vi.fn(),
    requireTripOwner: vi.fn(),
    tripAccessWhere,
  };
});
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
  vi.mocked(currentUserIdentity).mockReset();
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
  it('queries owned trips and accepted-collaborator trips, ordered by start date', async () => {
    vi.mocked(currentUserIdentity).mockResolvedValue({
      userId: 'user-1',
      email: 'me@example.com',
    });
    vi.mocked(db.trip.findMany).mockResolvedValue([] as never);

    await listTrips();

    expect(db.trip.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { userId: 'user-1' },
          {
            collaborators: {
              some: { email: 'me@example.com', status: 'ACCEPTED' },
            },
          },
        ],
      },
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { days: true } } },
    });
  });

  it('omits the collaborator clause entirely when the session carries no email', async () => {
    vi.mocked(currentUserIdentity).mockResolvedValue({
      userId: 'user-1',
      email: undefined,
    });
    vi.mocked(db.trip.findMany).mockResolvedValue([] as never);

    await listTrips();

    expect(db.trip.findMany).toHaveBeenCalledWith({
      where: { OR: [{ userId: 'user-1' }] },
      orderBy: { startDate: 'desc' },
      include: { _count: { select: { days: true } } },
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

describe('duplicateTrip', () => {
  it('refuses when requireTripAccess rejects', async () => {
    vi.mocked(requireTripAccess).mockRejectedValue(
      new ForbiddenOrNotFoundError(),
    );

    await expect(duplicateTrip('trip-1')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
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
