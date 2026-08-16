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
  return session.user.email.toLowerCase();
}

// Owner OR an accepted collaborator — the gate every nested resource
// (Day/Activity/Expense) and the trip's own reads/edits go through.
export async function requireTripAccess(tripId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthenticatedError();
  const userId = session.user.id;
  const email = session.user.email?.toLowerCase() ?? undefined;

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

// Swallows a race where the target was already deleted/revoked by someone
// else between this request's page load and the action running — the
// desired outcome is a silent no-op (the UI revalidates to the new state),
// not an uncaught crash.
export async function ignoreIfMissing(action: Promise<void>): Promise<void> {
  try {
    await action;
  } catch (err) {
    if (!(err instanceof ForbiddenOrNotFoundError)) throw err;
  }
}

// Owner only — deleting the trip and managing sharing itself.
export async function requireTripOwner(tripId: string) {
  const userId = await currentUserId();
  const trip = await db.trip.findFirst({ where: { id: tripId, userId } });
  if (!trip) throw new ForbiddenOrNotFoundError();
  return trip;
}
