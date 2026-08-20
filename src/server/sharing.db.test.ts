import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import { UnauthenticatedError } from './auth-scope';
import { InvalidShareLinkError } from './errors';
import {
  acceptInvite,
  declineInvite,
  duplicateSharedTrip,
  enableShareLink,
  getSharedTrip,
  inviteCollaborator,
  listPendingInvites,
  removeCollaborator,
  revokeShareLink,
} from './sharing';

vi.mock('../auth', () => ({ auth: vi.fn() }));

let ownerId: string;
let ownerEmail: string;
let tripId: string;
const inviteeEmail = `invitee-${crypto.randomUUID()}@example.com`;

function signInAsOwner() {
  vi.mocked(auth).mockResolvedValue({
    user: { id: ownerId, email: ownerEmail },
  } as never);
}

function signInAsInvitee() {
  vi.mocked(auth).mockResolvedValue({
    user: { id: 'invitee-id', email: inviteeEmail },
  } as never);
}

beforeEach(async () => {
  ownerEmail = `owner-${crypto.randomUUID()}@example.com`;
  const owner = await db.user.create({ data: { email: ownerEmail } });
  ownerId = owner.id;

  const trip = await db.trip.create({
    data: {
      userId: ownerId,
      name: 'Shared Trip',
      destinations: ['Tokyo'],
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-05'),
      baseCurrency: 'JPY',
      budgetMinor: 100000,
    },
  });
  tripId = trip.id;
});

afterEach(async () => {
  await db.tripCollaborator.deleteMany({ where: { tripId } });
  await db.trip.deleteMany({ where: { id: tripId } });
  await db.user.delete({ where: { id: ownerId } });
});

describe('share link against a real database', () => {
  it('enables, retrieves, and revokes a link end to end', async () => {
    signInAsOwner();
    const token = await enableShareLink(tripId);

    const { trip } = await getSharedTrip(token);
    expect(trip.id).toBe(tripId);
    expect(trip).not.toHaveProperty('userId');
    expect(trip).not.toHaveProperty('shareToken');

    signInAsOwner();
    await revokeShareLink(tripId);

    await expect(getSharedTrip(token)).rejects.toBeInstanceOf(
      InvalidShareLinkError,
    );
  });

  it('regenerating invalidates the previous token', async () => {
    signInAsOwner();
    const firstToken = await enableShareLink(tripId);
    signInAsOwner();
    const secondToken = await enableShareLink(tripId);

    expect(secondToken).not.toBe(firstToken);
    await expect(getSharedTrip(firstToken)).rejects.toBeInstanceOf(
      InvalidShareLinkError,
    );
    await expect(getSharedTrip(secondToken)).resolves.toMatchObject({
      trip: { id: tripId },
    });
  });
});

describe('collaborator invite flow against a real database', () => {
  it('invite -> accept makes the invitee a collaborator visible to the owner', async () => {
    signInAsOwner();
    await inviteCollaborator(tripId, inviteeEmail);

    signInAsInvitee();
    const pending = await listPendingInvites();
    expect(pending).toEqual([{ tripId, tripName: 'Shared Trip' }]);

    signInAsInvitee();
    await acceptInvite(tripId);

    const collaborators = await db.tripCollaborator.findMany({
      where: { tripId },
    });
    expect(collaborators).toHaveLength(1);
    expect(collaborators[0].status).toBe('ACCEPTED');
  });

  it('declining removes the invite entirely', async () => {
    signInAsOwner();
    await inviteCollaborator(tripId, inviteeEmail);

    signInAsInvitee();
    await declineInvite(tripId);

    const collaborators = await db.tripCollaborator.findMany({
      where: { tripId },
    });
    expect(collaborators).toHaveLength(0);
  });

  it('the owner can remove an accepted collaborator', async () => {
    signInAsOwner();
    await inviteCollaborator(tripId, inviteeEmail);
    signInAsInvitee();
    await acceptInvite(tripId);

    const collaborator = await db.tripCollaborator.findFirstOrThrow({
      where: { tripId },
    });
    signInAsOwner();
    await removeCollaborator(tripId, collaborator.id);

    const remaining = await db.tripCollaborator.findMany({ where: { tripId } });
    expect(remaining).toHaveLength(0);
  });
});

describe('duplicateSharedTrip against a real database', () => {
  async function withVisitor<T>(
    fn: (visitorId: string, visitorEmail: string) => Promise<T>,
  ): Promise<T> {
    const visitor = await db.user.create({
      data: { email: `visitor-${crypto.randomUUID()}@example.com` },
    });
    try {
      return await fn(visitor.id, visitor.email);
    } finally {
      // Cascades to the copied trip's days/activities — Trip's child
      // relations are all onDelete: Cascade.
      await db.trip.deleteMany({ where: { userId: visitor.id } });
      await db.user.delete({ where: { id: visitor.id } });
    }
  }

  it('requires a signed-in user even though the source link is public', async () => {
    signInAsOwner();
    const token = await enableShareLink(tripId);

    vi.mocked(auth).mockResolvedValue(null as never);

    await expect(duplicateSharedTrip(token)).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });

  it('refuses an unknown or disabled share token', () =>
    withVisitor(async (visitorId, visitorEmail) => {
      vi.mocked(auth).mockResolvedValue({
        user: { id: visitorId, email: visitorEmail },
      } as never);

      await expect(
        duplicateSharedTrip('not-a-real-token'),
      ).rejects.toBeInstanceOf(InvalidShareLinkError);

      // Same for a token that used to work but was revoked.
      signInAsOwner();
      const token = await enableShareLink(tripId);
      signInAsOwner();
      await revokeShareLink(tripId);

      vi.mocked(auth).mockResolvedValue({
        user: { id: visitorId, email: visitorEmail },
      } as never);
      await expect(duplicateSharedTrip(token)).rejects.toBeInstanceOf(
        InvalidShareLinkError,
      );
    }));

  it(
    'copies days and activities but never places or expenses, even when the ' +
      'source trip has both — this is the sharing security boundary',
    () =>
      withVisitor(async (visitorId, visitorEmail) => {
        // The source trip has a saved place, an activity pointing at it, and
        // a big-ticket expense — none of which getSharedTrip's public
        // include exposes, so none of it should survive into the copy.
        const place = await db.place.create({
          data: {
            tripId,
            source: 'manual',
            name: 'Ichiran',
            lat: 1,
            lng: 2,
            category: 'Food',
          },
        });
        const day = await db.day.create({
          data: { tripId, date: new Date('2026-09-01') },
        });
        await db.activity.create({
          data: {
            dayId: day.id,
            title: 'Ramen',
            category: 'Food',
            sortOrder: 0,
            placeId: place.id,
          },
        });
        await db.expense.create({
          data: {
            tripId,
            label: 'Flights',
            category: 'Transport',
            costMinor: 500000,
            costCurrency: 'JPY',
          },
        });
        await db.tripCollaborator.create({
          data: {
            tripId,
            email: `collab-${crypto.randomUUID()}@example.com`,
            status: 'ACCEPTED',
          },
        });

        signInAsOwner();
        const token = await enableShareLink(tripId);

        vi.mocked(auth).mockResolvedValue({
          user: { id: visitorId, email: visitorEmail },
        } as never);
        const newTrip = await duplicateSharedTrip(token);

        expect(newTrip.id).not.toBe(tripId);
        expect(newTrip.userId).toBe(visitorId);
        expect(newTrip.name).toBe('Shared Trip (copy)');
        expect(newTrip.shareToken).toBeNull();

        const newDays = await db.day.findMany({
          where: { tripId: newTrip.id },
          include: { activities: true },
        });
        expect(newDays).toHaveLength(1);
        expect(newDays[0].activities).toHaveLength(1);
        expect(newDays[0].activities[0].title).toBe('Ramen');
        // The security assertion: the activity is copied, but NOT its
        // placeId — there is no Place row for it to point at, because
        // Places were never part of the public share surface.
        expect(newDays[0].activities[0].placeId).toBeNull();

        const newPlaces = await db.place.findMany({
          where: { tripId: newTrip.id },
        });
        expect(newPlaces).toHaveLength(0);

        const newExpenses = await db.expense.findMany({
          where: { tripId: newTrip.id },
        });
        expect(newExpenses).toHaveLength(0);

        const newCollaborators = await db.tripCollaborator.findMany({
          where: { tripId: newTrip.id },
        });
        expect(newCollaborators).toHaveLength(0);
      }),
  );
});
