import { auth } from '../auth';
import { db } from '../lib/db';

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not signed in.');
  }
}

export class ForbiddenOrNotFoundError extends Error {
  constructor() {
    super("That trip doesn't exist or you don't have access.");
  }
}

export async function currentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthenticatedError();
  return session.user.id;
}

export async function currentUserEmail(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new UnauthenticatedError();
  return session.user.email;
}

// Owner OR an accepted collaborator — the gate every nested resource
// (Day/Activity/Expense) and the trip's own reads/edits go through.
export async function requireTripAccess(tripId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthenticatedError();
  const userId = session.user.id;
  const email = session.user.email ?? undefined;

  const trip = await db.trip.findFirst({
    where: {
      id: tripId,
      OR: [
        { userId },
        ...(email
          ? [{ collaborators: { some: { email, status: 'ACCEPTED' } } }]
          : []),
      ],
    },
  });
  if (!trip) throw new ForbiddenOrNotFoundError();
  return trip;
}

// Owner only — deleting the trip and managing sharing itself.
export async function requireTripOwner(tripId: string) {
  const userId = await currentUserId();
  const trip = await db.trip.findFirst({ where: { id: tripId, userId } });
  if (!trip) throw new ForbiddenOrNotFoundError();
  return trip;
}
