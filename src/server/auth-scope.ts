import { cache } from 'react';
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

// Every request-scoped caller (currentUserId, currentUserEmail,
// requireTripAccess, requireTripOwner) needs the same session — memoize it
// with React's request-scoped cache() so they share one lookup instead of
// each re-querying it. Outside a Next.js request (e.g. plain unit tests),
// cache() is a no-op passthrough, so this doesn't change test behavior.
const getSession = cache(() => auth());

export async function currentUserId(): Promise<string> {
  const session = await getSession();
  if (!session?.user?.id) throw new UnauthenticatedError();
  return session.user.id;
}

export async function currentUserEmail(): Promise<string> {
  const session = await getSession();
  if (!session?.user?.email) throw new UnauthenticatedError();
  return session.user.email.toLowerCase();
}

// "Owner OR an accepted collaborator", as a query — separated from *where the
// identity came from* so there is exactly one definition of trip access in
// the codebase. requireTripAccess below supplies the identity from the
// session; the browser extension's route handlers supply it from a bearer
// token (ADR-0017), because they run outside any session. A second copy of
// this predicate is precisely how the two paths would drift.
export async function requireTripAccessForUser(
  userId: string,
  email: string | undefined,
  tripId: string,
) {
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

// The gate every nested resource (Day/Activity/Expense) and the trip's own
// reads/edits go through.
// Memoized per tripId: several independent call sites (the trip page, its
// budget panel, itinerary, sharing status) all re-check access to the same
// trip within one request, so this dedupes them to one query instead of
// one per call site, without weakening the check itself — every call site
// still runs the full authorization logic, just sharing its result.
export const requireTripAccess = cache(async (tripId: string) => {
  const session = await getSession();
  if (!session?.user?.id) throw new UnauthenticatedError();
  return requireTripAccessForUser(
    session.user.id,
    session.user.email?.toLowerCase() ?? undefined,
    tripId,
  );
});

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

// Owner only — deleting the trip and managing sharing itself. Memoized per
// tripId for the same reason as requireTripAccess above.
export const requireTripOwner = cache(async (tripId: string) => {
  const userId = await currentUserId();
  const trip = await db.trip.findFirst({ where: { id: tripId, userId } });
  if (!trip) throw new ForbiddenOrNotFoundError();
  return trip;
});
