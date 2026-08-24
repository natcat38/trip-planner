import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { requireTripOwner } from './auth-scope';
import { StaleWriteError } from './errors';
import { enableShareLink, getShareStatus, revokeShareLink } from './sharing';

vi.mock('./auth-scope', () => {
  class ForbiddenOrNotFoundError extends Error {
    constructor() {
      super("That trip doesn't exist or you don't have access.");
    }
  }
  return {
    requireTripOwner: vi.fn(),
    currentUserEmail: vi.fn(),
    ForbiddenOrNotFoundError,
  };
});
vi.mock('../lib/db', () => ({
  db: {
    trip: { update: vi.fn(), updateMany: vi.fn(), findUnique: vi.fn() },
    day: { findMany: vi.fn() },
    expense: { findMany: vi.fn() },
    tripCollaborator: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock('./budget', () => ({ summarizeBudget: vi.fn() }));

const tripUpdatedAt = new Date('2026-01-01T00:00:00.000Z');
const trip = {
  id: 'trip-1',
  userId: 'user-1',
  shareToken: null,
  updatedAt: tripUpdatedAt,
};

beforeEach(() => {
  vi.mocked(requireTripOwner).mockReset();
  vi.mocked(currentUserEmail).mockReset();
  vi.mocked(db.trip.update).mockReset();
  vi.mocked(db.trip.updateMany).mockReset();
  vi.mocked(db.tripCollaborator.findMany).mockReset();
  vi.mocked(db.tripCollaborator.findUnique).mockReset();
  vi.mocked(db.tripCollaborator.findFirst).mockReset();
  vi.mocked(db.tripCollaborator.create).mockReset();
  vi.mocked(db.tripCollaborator.update).mockReset();
  vi.mocked(db.tripCollaborator.delete).mockReset();
});

describe('getShareStatus', () => {
  it('returns the share token and collaborators after owner authorization', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue({
      ...trip,
      shareToken: 'abc123',
    } as never);
    vi.mocked(db.tripCollaborator.findMany).mockResolvedValue([
      { id: 'c1', email: 'friend@example.com', status: 'ACCEPTED' },
    ] as never);

    const status = await getShareStatus('trip-1');

    expect(status).toEqual({
      shareToken: 'abc123',
      collaborators: [
        { id: 'c1', email: 'friend@example.com', status: 'ACCEPTED' },
      ],
    });
    expect(db.tripCollaborator.findMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1' },
      orderBy: { createdAt: 'asc' },
    });
  });
});

describe('enableShareLink', () => {
  it('generates and sets a new share token', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);
    vi.mocked(db.trip.updateMany).mockResolvedValue({ count: 1 } as never);

    const token = await enableShareLink('trip-1', tripUpdatedAt);

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
    expect(db.trip.updateMany).toHaveBeenCalledWith({
      where: { id: 'trip-1', updatedAt: tripUpdatedAt },
      data: { shareToken: token },
    });
  });

  it('generates a fresh token even when one already exists (regenerate)', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue({
      ...trip,
      shareToken: 'old-token',
    } as never);
    vi.mocked(db.trip.updateMany).mockResolvedValue({ count: 1 } as never);

    const token = await enableShareLink('trip-1', tripUpdatedAt);

    expect(token).not.toBe('old-token');
  });

  it('throws StaleWriteError when the trip changed since the caller last read it', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);
    vi.mocked(db.trip.updateMany).mockResolvedValue({ count: 0 } as never);

    await expect(
      enableShareLink('trip-1', tripUpdatedAt),
    ).rejects.toBeInstanceOf(StaleWriteError);
  });
});

describe('revokeShareLink', () => {
  it('clears the share token', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue({
      ...trip,
      shareToken: 'abc123',
    } as never);
    vi.mocked(db.trip.updateMany).mockResolvedValue({ count: 1 } as never);

    await revokeShareLink('trip-1', tripUpdatedAt);

    expect(db.trip.updateMany).toHaveBeenCalledWith({
      where: { id: 'trip-1', updatedAt: tripUpdatedAt },
      data: { shareToken: null },
    });
  });

  it('throws StaleWriteError when the trip changed since the caller last read it', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue({
      ...trip,
      shareToken: 'abc123',
    } as never);
    vi.mocked(db.trip.updateMany).mockResolvedValue({ count: 0 } as never);

    await expect(
      revokeShareLink('trip-1', tripUpdatedAt),
    ).rejects.toBeInstanceOf(StaleWriteError);
  });
});

import {
  acceptInvite,
  declineInvite,
  inviteCollaborator,
  listPendingInvites,
  removeCollaborator,
} from './sharing';
import { currentUserEmail, ForbiddenOrNotFoundError } from './auth-scope';
import { ValidationError } from './errors';
import { Prisma } from '../generated/prisma/client';

describe('inviteCollaborator', () => {
  it('creates a PENDING collaborator row after owner authorization', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);
    vi.mocked(db.tripCollaborator.create).mockResolvedValue({} as never);

    await inviteCollaborator('trip-1', 'friend@example.com');

    expect(db.tripCollaborator.create).toHaveBeenCalledWith({
      data: {
        tripId: 'trip-1',
        email: 'friend@example.com',
        status: 'PENDING',
      },
    });
  });

  it('normalizes the invited email to lowercase', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);
    vi.mocked(db.tripCollaborator.create).mockResolvedValue({} as never);

    await inviteCollaborator('trip-1', 'Friend@Example.com');

    expect(db.tripCollaborator.create).toHaveBeenCalledWith({
      data: {
        tripId: 'trip-1',
        email: 'friend@example.com',
        status: 'PENDING',
      },
    });
  });

  it('rejects an email that is already invited or already a collaborator', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);
    vi.mocked(db.tripCollaborator.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(
      inviteCollaborator('trip-1', 'friend@example.com'),
    ).rejects.toThrow(ValidationError);
  });

  it('rejects an invalid email', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);

    await expect(inviteCollaborator('trip-1', 'not-an-email')).rejects.toThrow(
      ValidationError,
    );
    expect(db.tripCollaborator.create).not.toHaveBeenCalled();
  });
});

describe('removeCollaborator', () => {
  it('deletes the collaborator row after owner authorization', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);
    vi.mocked(db.tripCollaborator.findFirst).mockResolvedValue({
      id: 'c1',
      tripId: 'trip-1',
    } as never);
    vi.mocked(db.tripCollaborator.delete).mockResolvedValue({} as never);

    await removeCollaborator('trip-1', 'c1');

    expect(db.tripCollaborator.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });

  it("throws ForbiddenOrNotFoundError when the collaborator isn't scoped to the trip", async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);
    vi.mocked(db.tripCollaborator.findFirst).mockResolvedValue(null);

    await expect(removeCollaborator('trip-1', 'c1')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});

describe('listPendingInvites', () => {
  it("lists the current user's pending invites with trip names", async () => {
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.tripCollaborator.findMany).mockResolvedValue([
      { trip: { id: 'trip-1', name: 'Japan Trip' } },
    ] as never);

    const invites = await listPendingInvites();

    expect(invites).toEqual([{ tripId: 'trip-1', tripName: 'Japan Trip' }]);
    expect(db.tripCollaborator.findMany).toHaveBeenCalledWith({
      where: { email: 'me@example.com', status: 'PENDING' },
      include: { trip: { select: { id: true, name: true } } },
    });
  });
});

describe('acceptInvite', () => {
  it('flips a matching pending invite to ACCEPTED', async () => {
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.tripCollaborator.findFirst).mockResolvedValue({
      id: 'c1',
    } as never);
    vi.mocked(db.tripCollaborator.update).mockResolvedValue({} as never);

    await acceptInvite('trip-1');

    expect(db.tripCollaborator.findFirst).toHaveBeenCalledWith({
      where: { tripId: 'trip-1', email: 'me@example.com', status: 'PENDING' },
    });
    expect(db.tripCollaborator.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'ACCEPTED' },
    });
  });

  it('throws ForbiddenOrNotFoundError when there is no matching pending invite', async () => {
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.tripCollaborator.findFirst).mockResolvedValue(null);

    await expect(acceptInvite('trip-1')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});

describe('declineInvite', () => {
  it('deletes a matching pending invite', async () => {
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.tripCollaborator.findFirst).mockResolvedValue({
      id: 'c1',
    } as never);
    vi.mocked(db.tripCollaborator.delete).mockResolvedValue({} as never);

    await declineInvite('trip-1');

    expect(db.tripCollaborator.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });

  it('throws ForbiddenOrNotFoundError when there is no matching pending invite', async () => {
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.tripCollaborator.findFirst).mockResolvedValue(null);

    await expect(declineInvite('trip-1')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});

import {
  getSharedBudgetSummary,
  getSharedTrip,
  listSharedExpenses,
} from './sharing';
import { InvalidShareLinkError } from './errors';
import { summarizeBudget } from './budget';

const sharedTrip = {
  id: 'trip-1',
  userId: 'user-1',
  name: 'Japan Trip',
  budgetMinor: 350000,
  baseCurrency: 'JPY',
  shareToken: 'abc123',
};

describe('getSharedTrip', () => {
  it('returns the trip and its days/activities for a valid token', async () => {
    vi.mocked(db.trip.findUnique).mockResolvedValue(sharedTrip as never);
    vi.mocked(db.day.findMany).mockResolvedValue([] as never);

    const result = await getSharedTrip('abc123');

    expect(result.trip).toEqual({
      id: 'trip-1',
      name: 'Japan Trip',
      budgetMinor: 350000,
      baseCurrency: 'JPY',
    });
    expect(db.day.findMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1' },
      orderBy: { date: 'asc' },
      include: { activities: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  it('strips userId and shareToken from the returned trip', async () => {
    vi.mocked(db.trip.findUnique).mockResolvedValue(sharedTrip as never);
    vi.mocked(db.day.findMany).mockResolvedValue([] as never);

    const result = await getSharedTrip('abc123');

    expect(result.trip).not.toHaveProperty('userId');
    expect(result.trip).not.toHaveProperty('shareToken');
  });

  it('throws InvalidShareLinkError for an unknown token', async () => {
    vi.mocked(db.trip.findUnique).mockResolvedValue(null);

    await expect(getSharedTrip('bad-token')).rejects.toBeInstanceOf(
      InvalidShareLinkError,
    );
  });

  it('exposes no places in the shared payload', async () => {
    vi.mocked(db.trip.findUnique).mockResolvedValue(sharedTrip as never);
    vi.mocked(db.day.findMany).mockResolvedValue([] as never);

    const result = await getSharedTrip('abc123');

    // The saved-places research tray is a planning workspace, not published
    // output, so it must never reach the public share payload. Assert the
    // exact query args (not just the returned shape) so this fails the
    // moment someone adds `places: true` to the include, even before any
    // fixture data would surface it.
    expect(result).not.toHaveProperty('places');
    expect(result.trip).not.toHaveProperty('places');
    expect(db.trip.findUnique).toHaveBeenCalledWith({
      where: { shareToken: 'abc123' },
    });
    expect(db.day.findMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1' },
      orderBy: { date: 'asc' },
      include: { activities: { orderBy: { sortOrder: 'asc' } } },
    });
  });
});

describe('getSharedBudgetSummary', () => {
  it('delegates to summarizeBudget for a valid token', async () => {
    vi.mocked(db.trip.findUnique).mockResolvedValue(sharedTrip as never);
    vi.mocked(summarizeBudget).mockResolvedValue({
      budgetMinor: 350000,
    } as never);

    const summary = await getSharedBudgetSummary('abc123');

    expect(summarizeBudget).toHaveBeenCalledWith(sharedTrip);
    expect(summary).toEqual({ budgetMinor: 350000 });
  });

  it('throws InvalidShareLinkError for an unknown token', async () => {
    vi.mocked(db.trip.findUnique).mockResolvedValue(null);

    await expect(getSharedBudgetSummary('bad-token')).rejects.toBeInstanceOf(
      InvalidShareLinkError,
    );
  });
});

describe('listSharedExpenses', () => {
  it('returns the expenses for a valid token', async () => {
    vi.mocked(db.trip.findUnique).mockResolvedValue(sharedTrip as never);
    vi.mocked(db.expense.findMany).mockResolvedValue([{ id: 'e1' }] as never);

    const expenses = await listSharedExpenses('abc123');

    expect(expenses).toEqual([{ id: 'e1' }]);
    expect(db.expense.findMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1' },
      orderBy: { id: 'asc' },
    });
  });
});
