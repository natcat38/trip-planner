'use server';

/**
 * Trip sharing: a public read-only link (Trip.shareToken) and named
 * Collaborators (TripCollaborator, invited by email, explicitly accepted or
 * declined — no separate accept/decline table, just a status column).
 * @packageDocumentation
 */

import { randomBytes } from 'node:crypto';
import type { Activity, Day, Expense, Trip } from '../generated/prisma/client';
import { db } from '../lib/db';
import {
  currentUserEmail,
  ForbiddenOrNotFoundError,
  requireTripOwner,
} from './auth-scope';
import { InvalidShareLinkError, ValidationError } from './errors';
import { summarizeBudget, type BudgetSummary } from './budget';

export interface CollaboratorSummary {
  id: string;
  email: string;
  status: string;
}

export interface ShareStatus {
  shareToken: string | null;
  collaborators: CollaboratorSummary[];
}

export async function getShareStatus(tripId: string): Promise<ShareStatus> {
  const trip = await requireTripOwner(tripId);
  const collaborators = await db.tripCollaborator.findMany({
    where: { tripId: trip.id },
    orderBy: { createdAt: 'asc' },
  });
  return {
    shareToken: trip.shareToken,
    collaborators: collaborators.map((c) => ({
      id: c.id,
      email: c.email,
      status: c.status,
    })),
  };
}

export async function enableShareLink(tripId: string): Promise<string> {
  const trip = await requireTripOwner(tripId);
  const shareToken = randomBytes(24).toString('base64url');
  await db.trip.update({ where: { id: trip.id }, data: { shareToken } });
  return shareToken;
}

export async function revokeShareLink(tripId: string): Promise<void> {
  const trip = await requireTripOwner(tripId);
  await db.trip.update({
    where: { id: trip.id },
    data: { shareToken: null },
  });
}

function validateEmail(email: string) {
  if (!email.includes('@')) {
    throw new ValidationError('Enter a valid email address.');
  }
}

export async function inviteCollaborator(
  tripId: string,
  email: string,
): Promise<void> {
  const trip = await requireTripOwner(tripId);
  validateEmail(email);
  const existing = await db.tripCollaborator.findUnique({
    where: { tripId_email: { tripId: trip.id, email } },
  });
  if (existing) {
    throw new ValidationError(
      'This person is already invited or already a collaborator.',
    );
  }
  await db.tripCollaborator.create({
    data: { tripId: trip.id, email, status: 'PENDING' },
  });
}

export async function removeCollaborator(
  tripId: string,
  collaboratorId: string,
): Promise<void> {
  const trip = await requireTripOwner(tripId);
  const collaborator = await db.tripCollaborator.findFirst({
    where: { id: collaboratorId, tripId: trip.id },
  });
  if (!collaborator) throw new ForbiddenOrNotFoundError();
  await db.tripCollaborator.delete({ where: { id: collaborator.id } });
}

export interface PendingInvite {
  tripId: string;
  tripName: string;
}

export async function listPendingInvites(): Promise<PendingInvite[]> {
  const email = await currentUserEmail();
  const invites = await db.tripCollaborator.findMany({
    where: { email, status: 'PENDING' },
    include: { trip: { select: { id: true, name: true } } },
  });
  return invites.map((invite) => ({
    tripId: invite.trip.id,
    tripName: invite.trip.name,
  }));
}

async function requireOwnPendingInvite(tripId: string) {
  const email = await currentUserEmail();
  const invite = await db.tripCollaborator.findFirst({
    where: { tripId, email, status: 'PENDING' },
  });
  if (!invite) throw new ForbiddenOrNotFoundError();
  return invite;
}

export async function acceptInvite(tripId: string): Promise<void> {
  const invite = await requireOwnPendingInvite(tripId);
  await db.tripCollaborator.update({
    where: { id: invite.id },
    data: { status: 'ACCEPTED' },
  });
}

export async function declineInvite(tripId: string): Promise<void> {
  const invite = await requireOwnPendingInvite(tripId);
  await db.tripCollaborator.delete({ where: { id: invite.id } });
}

async function requireShareToken(token: string) {
  const trip = await db.trip.findUnique({ where: { shareToken: token } });
  if (!trip) throw new InvalidShareLinkError();
  return trip;
}

export async function getSharedTrip(token: string): Promise<{
  trip: Omit<Trip, 'userId' | 'shareToken'>;
  days: (Day & { activities: Activity[] })[];
}> {
  const trip = await requireShareToken(token);
  const days = await db.day.findMany({
    where: { tripId: trip.id },
    orderBy: { date: 'asc' },
    include: { activities: { orderBy: { sortOrder: 'asc' } } },
  });
  // This is the one read path with no session/auth gate at all, so its
  // return shape IS the public API surface — strip owner/token fields here
  // rather than relying on callers (today: a Server Component) to not leak
  // them. Don't narrow requireShareToken's own query: getSharedBudgetSummary
  // and listSharedExpenses need the full trip row.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructuring to omit fields from the response, not to use them
  const { userId, shareToken, ...publicTrip } = trip;
  return { trip: publicTrip, days };
}

export async function getSharedBudgetSummary(
  token: string,
): Promise<BudgetSummary> {
  const trip = await requireShareToken(token);
  return summarizeBudget(trip);
}

export async function listSharedExpenses(token: string): Promise<Expense[]> {
  const trip = await requireShareToken(token);
  return db.expense.findMany({ where: { tripId: trip.id } });
}
