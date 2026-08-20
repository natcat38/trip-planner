import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import { ForbiddenOrNotFoundError } from './auth-scope';
import { addChecklistItem, listChecklist } from './checklist';

// Real Postgres, only next-auth's session lookup stubbed — same rationale as
// places.db.test.ts.
vi.mock('../auth', () => ({ auth: vi.fn() }));

let userId: string;
let tripId: string;

beforeEach(async () => {
  const user = await db.user.create({
    data: { email: `checklist-db-test-${crypto.randomUUID()}@example.com` },
  });
  userId = user.id;
  vi.mocked(auth).mockResolvedValue({ user: { id: userId } } as never);

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
});

afterEach(async () => {
  await db.trip.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
});

describe('checklist against a real database', () => {
  it('cascade-deletes checklist items when the parent trip is deleted', async () => {
    const item = await addChecklistItem(tripId, 'Pack the charger');

    await db.trip.delete({ where: { id: tripId } });

    expect(
      await db.checklistItem.findUnique({ where: { id: item.id } }),
    ).toBeNull();
  });

  it('a non-collaborator is denied on addChecklistItem and listChecklist', async () => {
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

      // vi.mocked(auth) still resolves to the original (unprivileged) userId,
      // so every call below is "signed in as userId, reaching for otherTrip".
      await expect(
        addChecklistItem(otherTrip.id, 'Sneaky'),
      ).rejects.toBeInstanceOf(ForbiddenOrNotFoundError);

      await expect(listChecklist(otherTrip.id)).rejects.toBeInstanceOf(
        ForbiddenOrNotFoundError,
      );
    } finally {
      await db.trip.deleteMany({ where: { userId: otherUser.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    }
  });
});
