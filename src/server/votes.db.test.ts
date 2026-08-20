import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import { ForbiddenOrNotFoundError } from './auth-scope';
import { listVotesForTrip, toggleVote } from './votes';

// Real Postgres, only next-auth's session lookup stubbed — same rationale as places.db.test.ts.
vi.mock('../auth', () => ({ auth: vi.fn() }));

let userId: string;
let userEmail: string;
let tripId: string;
let dayId: string;
let activityId: string;

beforeEach(async () => {
  userEmail = `votes-db-test-${crypto.randomUUID()}@example.com`;
  const user = await db.user.create({ data: { email: userEmail } });
  userId = user.id;
  vi.mocked(auth).mockResolvedValue({
    user: { id: userId, email: userEmail },
  } as never);

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

  const day = await db.day.create({
    data: { tripId, date: new Date('2026-09-01') },
  });
  dayId = day.id;

  const activity = await db.activity.create({
    data: {
      dayId,
      title: 'Ichiran Ramen',
      category: 'Food',
      sortOrder: 0,
    },
  });
  activityId = activity.id;
});

afterEach(async () => {
  await db.trip.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
});

describe('votes against a real database', () => {
  it('cascade-deletes votes when the parent activity is deleted', async () => {
    await toggleVote(tripId, activityId);
    const vote = await db.activityVote.findUnique({
      where: {
        activityId_voterEmail: { activityId, voterEmail: userEmail },
      },
    });
    expect(vote).not.toBeNull();

    await db.activity.delete({ where: { id: activityId } });

    expect(
      await db.activityVote.findMany({ where: { activityId } }),
    ).toHaveLength(0);
  });

  it('toggles a vote on then off against the real unique constraint', async () => {
    await toggleVote(tripId, activityId);
    expect(await db.activityVote.count({ where: { activityId } })).toBe(1);

    await toggleVote(tripId, activityId);
    expect(await db.activityVote.count({ where: { activityId } })).toBe(0);
  });

  it('a non-collaborator is denied on toggleVote and listVotesForTrip', async () => {
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
      const otherActivity = await db.activity.create({
        data: {
          dayId: otherDay.id,
          title: 'Secret spot',
          category: 'Other',
          sortOrder: 0,
        },
      });

      // vi.mocked(auth) still resolves to the original (unprivileged) userId,
      // so every call below is "signed in as userId, reaching for otherTrip".
      await expect(
        toggleVote(otherTrip.id, otherActivity.id),
      ).rejects.toBeInstanceOf(ForbiddenOrNotFoundError);

      await expect(listVotesForTrip(otherTrip.id)).rejects.toBeInstanceOf(
        ForbiddenOrNotFoundError,
      );
    } finally {
      await db.trip.deleteMany({ where: { userId: otherUser.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    }
  });
});
