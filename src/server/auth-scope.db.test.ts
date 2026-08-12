import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import {
  ForbiddenOrNotFoundError,
  requireTripAccess,
  requireTripOwner,
} from './auth-scope';

vi.mock('../auth', () => ({ auth: vi.fn() }));

let ownerId: string;
let ownerEmail: string;
let collaboratorId: string;
let collaboratorEmail: string;
let tripId: string;

beforeEach(async () => {
  ownerEmail = `owner-${crypto.randomUUID()}@example.com`;
  collaboratorEmail = `collaborator-${crypto.randomUUID()}@example.com`;
  const owner = await db.user.create({ data: { email: ownerEmail } });
  const collaborator = await db.user.create({
    data: { email: collaboratorEmail },
  });
  ownerId = owner.id;
  collaboratorId = collaborator.id;

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
  await db.user.deleteMany({
    where: { id: { in: [ownerId, collaboratorId] } },
  });
});

function signInAs(userId: string, email: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId, email } } as never);
}

describe('requireTripAccess against a real database', () => {
  it('allows the owner', async () => {
    signInAs(ownerId, ownerEmail);
    await expect(requireTripAccess(tripId)).resolves.toMatchObject({
      id: tripId,
    });
  });

  it('allows an accepted collaborator', async () => {
    await db.tripCollaborator.create({
      data: { tripId, email: collaboratorEmail, status: 'ACCEPTED' },
    });
    signInAs(collaboratorId, collaboratorEmail);
    await expect(requireTripAccess(tripId)).resolves.toMatchObject({
      id: tripId,
    });
  });

  it('rejects a pending (not yet accepted) collaborator', async () => {
    await db.tripCollaborator.create({
      data: { tripId, email: collaboratorEmail, status: 'PENDING' },
    });
    signInAs(collaboratorId, collaboratorEmail);
    await expect(requireTripAccess(tripId)).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });

  it('rejects a user with no relation to the trip', async () => {
    signInAs(collaboratorId, collaboratorEmail);
    await expect(requireTripAccess(tripId)).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});

describe('requireTripOwner against a real database', () => {
  it('allows the owner', async () => {
    signInAs(ownerId, ownerEmail);
    await expect(requireTripOwner(tripId)).resolves.toMatchObject({
      id: tripId,
    });
  });

  it('rejects an accepted collaborator', async () => {
    await db.tripCollaborator.create({
      data: { tripId, email: collaboratorEmail, status: 'ACCEPTED' },
    });
    signInAs(collaboratorId, collaboratorEmail);
    await expect(requireTripOwner(tripId)).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});
