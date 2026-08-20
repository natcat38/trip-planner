'use server';

/**
 * Trip sharing: a public read-only link (Trip.shareToken) and named
 * Collaborators (TripCollaborator, invited by email, explicitly accepted or
 * declined — no separate accept/decline table, just a status column).
 * @packageDocumentation
 */

import { randomBytes } from 'node:crypto';
import {
  Prisma,
  type Activity,
  type Day,
  type Expense,
  type Trip,
} from '../generated/prisma/client';
import { db } from '../lib/db';
import {
  currentUserEmail,
  currentUserId,
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
  const normalizedEmail = email.trim().toLowerCase();
  validateEmail(normalizedEmail);
  try {
    await db.tripCollaborator.create({
      data: { tripId: trip.id, email: normalizedEmail, status: 'PENDING' },
    });
  } catch (err) {
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      throw new ValidationError(
        'This person is already invited or already a collaborator.',
      );
    }
    throw err;
  }
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
    // Anything added to this include becomes world-readable — see the note
    // below.
    include: { activities: { orderBy: { sortOrder: 'asc' } } },
  });
  // This is the one read path with no session/auth gate at all, so its
  // return shape IS the public API surface — strip owner/token fields here
  // rather than relying on callers (today: a Server Component) to not leak
  // them. Don't narrow requireShareToken's own query: getSharedBudgetSummary
  // and listSharedExpenses need the full trip row. The saved-places research
  // tray (Trip.places) is a planning workspace, not published output — it is
  // deliberately left out of this include and must stay that way.
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
  return db.expense.findMany({
    where: { tripId: trip.id },
    orderBy: { id: 'asc' },
  });
}

// Clones a trip from its public share link into a brand new trip owned by
// the signed-in caller. Requires currentUserId() even though the source
// link itself is public — an anonymous visitor has no account to own the
// copy.
//
// THE SECURITY BOUNDARY: this is built on top of getSharedTrip() rather than
// re-querying the trip/days/activities directly, specifically so it can only
// ever copy what getSharedTrip already exposes publicly. If this instead ran
// its own `db.day.findMany`/`db.place.findMany` queries, the two read paths
// could silently drift apart over time — that drift is exactly how a field
// meant to stay private (the saved-places tray, Expenses, collaborators, the
// share token itself) ends up leaking into a "copy" anyone with the link can
// make. So: NOT copied here, on purpose —
// - Places (the saved-places tray): a private research workspace, never
//   part of getSharedTrip's public include (see its own comment above).
// - Expenses: not part of getSharedTrip's return shape either.
// - collaborators / shareToken: same reasoning as duplicateTrip in
//   src/server/trips.ts — a copy is a new trip, not a fork of who can see
//   or share the original.
export async function duplicateSharedTrip(token: string) {
  const userId = await currentUserId();
  const { trip, days } = await getSharedTrip(token);

  return db.$transaction(async (tx) => {
    const newTrip = await tx.trip.create({
      data: {
        userId,
        name: `${trip.name} (copy)`,
        destinations: trip.destinations,
        startDate: trip.startDate,
        endDate: trip.endDate,
        baseCurrency: trip.baseCurrency,
        budgetMinor: trip.budgetMinor,
      },
    });

    for (const day of days) {
      const newDay = await tx.day.create({
        data: { tripId: newTrip.id, date: day.date },
      });
      for (const activity of day.activities) {
        const {
          id: _id,
          dayId: _dayId,
          updatedAt: _updatedAt,
          // placeId is never carried over: getSharedTrip doesn't expose
          // Place rows at all, so there is nothing of the caller's to point
          // it at — and pointing it at the ORIGINAL trip's place would leak
          // a row across trip boundaries.
          placeId: _placeId,
          ...rest
        } = activity;
        await tx.activity.create({
          data: { ...rest, dayId: newDay.id },
        });
      }
    }

    return newTrip;
  });
}
