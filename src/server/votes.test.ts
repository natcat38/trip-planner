import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { Prisma } from '../generated/prisma/client';
import {
  currentUserEmail,
  ForbiddenOrNotFoundError,
  requireTripAccess,
} from './auth-scope';
import { requireActivity } from './itinerary';
import { listVotesForTrip, toggleVote } from './votes';

// Mocked as a plain factory (not importOriginal) so this never touches the real
// auth-scope.ts -> ../auth -> next-auth -> next/server chain — same rationale
// as places.test.ts / itinerary.test.ts.
vi.mock('./auth-scope', () => {
  class ForbiddenOrNotFoundError extends Error {
    constructor() {
      super("That trip doesn't exist or you don't have access.");
    }
  }
  return {
    requireTripAccess: vi.fn(),
    currentUserEmail: vi.fn(),
    ForbiddenOrNotFoundError,
  };
});
vi.mock('./itinerary', () => ({ requireActivity: vi.fn() }));
vi.mock('../lib/db', () => ({
  db: {
    activityVote: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.mocked(requireTripAccess).mockReset();
  vi.mocked(currentUserEmail).mockReset();
  vi.mocked(requireActivity).mockReset();
  vi.mocked(db.activityVote.findUnique).mockReset();
  vi.mocked(db.activityVote.findMany).mockReset();
  vi.mocked(db.activityVote.create).mockReset();
  vi.mocked(db.activityVote.deleteMany).mockReset();
});

const activity = { id: 'activity-1', dayId: 'day-1' };

describe('every exported function refuses when authorization rejects', () => {
  const denied = new ForbiddenOrNotFoundError();

  it('toggleVote refuses when requireActivity (and thus requireTripAccess) rejects', async () => {
    vi.mocked(requireActivity).mockRejectedValue(denied);

    await expect(toggleVote('trip-1', 'activity-1')).rejects.toBe(denied);
    expect(db.activityVote.findUnique).not.toHaveBeenCalled();
    expect(db.activityVote.create).not.toHaveBeenCalled();
  });

  it('listVotesForTrip refuses when requireTripAccess rejects', async () => {
    vi.mocked(requireTripAccess).mockRejectedValue(denied);

    await expect(listVotesForTrip('trip-1')).rejects.toBe(denied);
    expect(db.activityVote.findMany).not.toHaveBeenCalled();
  });
});

describe('toggleVote', () => {
  it('adds a vote for the current user when none exists', async () => {
    vi.mocked(requireActivity).mockResolvedValue(activity as never);
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.activityVote.findUnique).mockResolvedValue(null);
    vi.mocked(db.activityVote.create).mockResolvedValue({} as never);

    await toggleVote('trip-1', 'activity-1');

    expect(db.activityVote.create).toHaveBeenCalledWith({
      data: { activityId: 'activity-1', voterEmail: 'me@example.com' },
    });
  });

  it('removes the vote on a second call (toggles off)', async () => {
    vi.mocked(requireActivity).mockResolvedValue(activity as never);
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.activityVote.findUnique).mockResolvedValue({
      id: 'vote-1',
      activityId: 'activity-1',
      voterEmail: 'me@example.com',
    } as never);
    vi.mocked(db.activityVote.deleteMany).mockResolvedValue({
      count: 1,
    } as never);

    await toggleVote('trip-1', 'activity-1');

    expect(db.activityVote.deleteMany).toHaveBeenCalledWith({
      where: { activityId: 'activity-1', voterEmail: 'me@example.com' },
    });
    expect(db.activityVote.create).not.toHaveBeenCalled();
  });

  it('never accepts a voter identity from the caller — always uses currentUserEmail', async () => {
    vi.mocked(requireActivity).mockResolvedValue(activity as never);
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.activityVote.findUnique).mockResolvedValue(null);
    vi.mocked(db.activityVote.create).mockResolvedValue({} as never);

    await toggleVote('trip-1', 'activity-1');

    expect(db.activityVote.findUnique).toHaveBeenCalledWith({
      where: {
        activityId_voterEmail: {
          activityId: 'activity-1',
          voterEmail: 'me@example.com',
        },
      },
    });
  });

  it('swallows a P2002 unique-constraint violation from a racing double-submit instead of throwing', async () => {
    vi.mocked(requireActivity).mockResolvedValue(activity as never);
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.activityVote.findUnique).mockResolvedValue(null);
    vi.mocked(db.activityVote.create).mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );

    await expect(toggleVote('trip-1', 'activity-1')).resolves.toBeUndefined();
  });

  it('rethrows a non-P2002 error from create', async () => {
    vi.mocked(requireActivity).mockResolvedValue(activity as never);
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.activityVote.findUnique).mockResolvedValue(null);
    const boom = new Error('boom');
    vi.mocked(db.activityVote.create).mockRejectedValue(boom);

    await expect(toggleVote('trip-1', 'activity-1')).rejects.toBe(boom);
  });
});

describe('listVotesForTrip', () => {
  it('tallies votes per activity and reports mine only for the current user', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue({ id: 'trip-1' } as never);
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.activityVote.findMany).mockResolvedValue([
      { activityId: 'activity-1', voterEmail: 'me@example.com' },
      { activityId: 'activity-1', voterEmail: 'friend@example.com' },
      { activityId: 'activity-2', voterEmail: 'friend@example.com' },
    ] as never);

    const result = await listVotesForTrip('trip-1');

    expect(result['activity-1']).toEqual({
      count: 2,
      voters: ['me@example.com', 'friend@example.com'],
      mine: true,
    });
    expect(result['activity-2']).toEqual({
      count: 1,
      voters: ['friend@example.com'],
      mine: false,
    });
  });

  it('scopes the query to the trip', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue({ id: 'trip-1' } as never);
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.activityVote.findMany).mockResolvedValue([] as never);

    await listVotesForTrip('trip-1');

    expect(db.activityVote.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { activity: { day: { tripId: 'trip-1' } } },
      }),
    );
  });
});
