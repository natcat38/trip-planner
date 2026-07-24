import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import {
  currentUserId,
  ForbiddenOrNotFoundError,
  requireTrip,
  UnauthenticatedError,
} from './auth-scope';

vi.mock('../auth', () => ({ auth: vi.fn() }));
vi.mock('../lib/db', () => ({ db: { trip: { findFirst: vi.fn() } } }));

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(db.trip.findFirst).mockReset();
});

describe('currentUserId', () => {
  it('returns the session user id when signed in', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    await expect(currentUserId()).resolves.toBe('user-1');
  });

  it('throws UnauthenticatedError when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(currentUserId()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe('requireTrip', () => {
  it('returns the trip when owned by the current user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    const trip = { id: 'trip-1', userId: 'user-1' };
    vi.mocked(db.trip.findFirst).mockResolvedValue(trip as never);

    await expect(requireTrip('trip-1')).resolves.toBe(trip);
    expect(db.trip.findFirst).toHaveBeenCalledWith({
      where: { id: 'trip-1', userId: 'user-1' },
    });
  });

  it('throws ForbiddenOrNotFoundError when the trip is not owned or does not exist', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(db.trip.findFirst).mockResolvedValue(null);

    await expect(requireTrip('trip-2')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });

  it('throws UnauthenticatedError when there is no session, without querying the trip', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    await expect(requireTrip('trip-1')).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    expect(db.trip.findFirst).not.toHaveBeenCalled();
  });
});
