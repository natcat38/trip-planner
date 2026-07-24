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

export async function requireTrip(tripId: string) {
  const userId = await currentUserId();
  const trip = await db.trip.findFirst({ where: { id: tripId, userId } });
  if (!trip) throw new ForbiddenOrNotFoundError();
  return trip;
}
