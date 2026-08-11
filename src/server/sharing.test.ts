import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { requireTripOwner } from './auth-scope';
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
    trip: { update: vi.fn() },
    tripCollaborator: { findMany: vi.fn() },
  },
}));

const trip = { id: 'trip-1', userId: 'user-1', shareToken: null };

beforeEach(() => {
  vi.mocked(requireTripOwner).mockReset();
  vi.mocked(db.trip.update).mockReset();
  vi.mocked(db.tripCollaborator.findMany).mockReset();
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
    vi.mocked(db.trip.update).mockResolvedValue({} as never);

    const token = await enableShareLink('trip-1');

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
    expect(db.trip.update).toHaveBeenCalledWith({
      where: { id: 'trip-1' },
      data: { shareToken: token },
    });
  });

  it('generates a fresh token even when one already exists (regenerate)', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue({
      ...trip,
      shareToken: 'old-token',
    } as never);
    vi.mocked(db.trip.update).mockResolvedValue({} as never);

    const token = await enableShareLink('trip-1');

    expect(token).not.toBe('old-token');
  });
});

describe('revokeShareLink', () => {
  it('clears the share token', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue({
      ...trip,
      shareToken: 'abc123',
    } as never);
    vi.mocked(db.trip.update).mockResolvedValue({} as never);

    await revokeShareLink('trip-1');

    expect(db.trip.update).toHaveBeenCalledWith({
      where: { id: 'trip-1' },
      data: { shareToken: null },
    });
  });
});
