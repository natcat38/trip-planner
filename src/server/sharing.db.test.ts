import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import { InvalidShareLinkError } from './errors';
import {
  acceptInvite,
  declineInvite,
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
