import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { planJourney } from '../lib/research/transitous';
import { ForbiddenOrNotFoundError } from './auth-scope';
import { requireActivity } from './itinerary';
import { planJourneyBetweenActivities } from './transit';

// Mocked as plain factories (not importOriginal) so this never touches the
// real auth-scope.ts -> ../auth -> next-auth -> next/server chain — same
// rationale as itinerary.test.ts / places.test.ts. requireActivity is what
// planJourneyBetweenActivities actually calls (it wraps requireTripAccess),
// so mocking it directly is the right seam here; auth-scope is mocked only so
// importing its ForbiddenOrNotFoundError class doesn't drag in the real chain.
vi.mock('./auth-scope', () => {
  class ForbiddenOrNotFoundError extends Error {
    constructor() {
      super("That trip doesn't exist or you don't have access.");
    }
  }
  return { ForbiddenOrNotFoundError };
});
vi.mock('./itinerary', () => ({ requireActivity: vi.fn() }));
vi.mock('../lib/db', () => ({
  db: { day: { findFirst: vi.fn() } },
}));
vi.mock('../lib/research/transitous', () => ({ planJourney: vi.fn() }));

beforeEach(() => {
  vi.mocked(requireActivity).mockReset();
  vi.mocked(db.day.findFirst).mockReset();
  vi.mocked(planJourney).mockReset();
});

const fromActivity = {
  id: 'activity-from',
  dayId: 'day-1',
  lat: 35.6812,
  lng: 139.7671,
  startTime: null,
};

const toActivity = {
  id: 'activity-to',
  dayId: 'day-1',
  lat: 35.6586,
  lng: 139.7454,
  startTime: '14:30',
};

function mockActivities(from: unknown, to: unknown) {
  vi.mocked(requireActivity).mockImplementation(
    async (_tripId, id) => (id === 'activity-from' ? from : to) as never,
  );
}

describe('planJourneyBetweenActivities', () => {
  it('refuses when the activities cannot be authorized (requireTripAccess rejects)', async () => {
    const denied = new ForbiddenOrNotFoundError();
    vi.mocked(requireActivity).mockRejectedValue(denied);

    await expect(
      planJourneyBetweenActivities('trip-1', 'activity-from', 'activity-to'),
    ).rejects.toBe(denied);
    expect(planJourney).not.toHaveBeenCalled();
  });

  it('returns null without calling Transitous when the origin activity has no coordinates', async () => {
    mockActivities({ ...fromActivity, lat: null, lng: null }, toActivity);

    const result = await planJourneyBetweenActivities(
      'trip-1',
      'activity-from',
      'activity-to',
    );

    expect(result).toBeNull();
    expect(planJourney).not.toHaveBeenCalled();
    expect(db.day.findFirst).not.toHaveBeenCalled();
  });

  it('returns null without calling Transitous when the destination activity has no coordinates', async () => {
    mockActivities(fromActivity, { ...toActivity, lat: null, lng: null });

    const result = await planJourneyBetweenActivities(
      'trip-1',
      'activity-from',
      'activity-to',
    );

    expect(result).toBeNull();
    expect(planJourney).not.toHaveBeenCalled();
  });

  it('resolves coordinates, passes them through to planJourney, and derives departure time from the day date + destination startTime', async () => {
    mockActivities(fromActivity, toActivity);
    vi.mocked(db.day.findFirst).mockResolvedValue({
      id: 'day-1',
      date: new Date('2026-09-05T00:00:00.000Z'),
    } as never);
    const journeys = [
      {
        durationSeconds: 600,
        transfers: 0,
        startTime: '',
        endTime: '',
        legs: [],
      },
    ];
    vi.mocked(planJourney).mockResolvedValue(journeys as never);

    const result = await planJourneyBetweenActivities(
      'trip-1',
      'activity-from',
      'activity-to',
    );

    expect(planJourney).toHaveBeenCalledWith(
      { lat: fromActivity.lat, lng: fromActivity.lng },
      { lat: toActivity.lat, lng: toActivity.lng },
      new Date('2026-09-05T14:30:00.000Z'),
    );
    expect(result).toBe(journeys);
  });

  it('falls back to a midday default departure when the destination activity has no startTime', async () => {
    mockActivities(fromActivity, { ...toActivity, startTime: null });
    vi.mocked(db.day.findFirst).mockResolvedValue({
      id: 'day-1',
      date: new Date('2026-09-05T00:00:00.000Z'),
    } as never);
    vi.mocked(planJourney).mockResolvedValue([]);

    const result = await planJourneyBetweenActivities(
      'trip-1',
      'activity-from',
      'activity-to',
    );

    expect(planJourney).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      new Date('2026-09-05T12:00:00.000Z'),
    );
    expect(result).toEqual([]);
  });

  it('passes an empty-array result (confirmed no route) straight through, distinct from null', async () => {
    mockActivities(fromActivity, toActivity);
    vi.mocked(db.day.findFirst).mockResolvedValue({
      id: 'day-1',
      date: new Date('2026-09-05T00:00:00.000Z'),
    } as never);
    vi.mocked(planJourney).mockResolvedValue([]);

    const result = await planJourneyBetweenActivities(
      'trip-1',
      'activity-from',
      'activity-to',
    );

    expect(result).toEqual([]);
    expect(result).not.toBeNull();
  });
});
