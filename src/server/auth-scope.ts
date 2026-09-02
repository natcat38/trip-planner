import { cache } from 'react';
import { auth } from '../auth';
import { db } from '../lib/db';
import { RateLimitError, StaleWriteError, ValidationError } from './errors';
import { tripAccessWhere } from './trip-access-where';

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

// Like currentUserId, but also carries the session's email (lowercased, the
// same normalization every other consumer of a session email applies —
// TripCollaborator.email is normalized at invite time, but the session's
// User.email is not, so callers that skip this end up comparing
// differently-cased strings and silently failing to match a real
// collaborator). Unlike currentUserEmail, a missing email is not an error:
// some accounts genuinely have none, and a caller building a "what can this
// user see" query should degrade to owner-only, not throw.
export async function currentUserIdentity(): Promise<{
  userId: string;
  email: string | undefined;
}> {
  const session = await getSession();
  if (!session?.user?.id) throw new UnauthenticatedError();
  return {
    userId: session.user.id,
    email: session.user.email?.toLowerCase() ?? undefined,
  };
}

// "Owner OR an accepted collaborator", as a query — separated from *where the
// identity came from* so there is exactly one definition of trip access in
// the codebase. Every caller (requireTripAccessForUser below, and the trip
// list queries in trips.ts/extensionApi.ts) builds its `where` from this one
// helper instead of writing the OR shape out again — a second copy of this
// predicate is precisely how those paths would drift. Re-exported here (the
// implementation lives in trip-access-where.ts, see that file for why) so
// existing callers keep importing it from auth-scope.ts.
export { tripAccessWhere } from './trip-access-where';

// requireTripAccess below supplies the identity from the session; the
// browser extension's route handlers supply it from a bearer token
// (ADR-0017), because they run outside any session.
export async function requireTripAccessForUser(
  userId: string,
  email: string | undefined,
  tripId: string,
) {
  const trip = await db.trip.findFirst({
    where: { id: tripId, ...tripAccessWhere(userId, email) },
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
  const { userId, email } = await currentUserIdentity();
  return requireTripAccessForUser(userId, email, tripId);
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

// The ~10 near-identical Server Action try/catch blocks across
// src/app/trips/**/actions.ts all do the same thing: call a domain function,
// and turn a known domain error into `{ error: message }` for useActionState
// to render, while letting anything else (including Next's redirect()/
// notFound() control-flow throws) propagate. `errorClasses` lets each call
// site opt into exactly the subset it used to catch — e.g. addActivityAction
// only ever needs ValidationError, updateActivityAction needs all three.
export function withFormErrors<
  Args extends unknown[],
  State extends { error?: string },
>(
  fn: (...args: Args) => Promise<State>,
  errorClasses: (
    | typeof ValidationError
    | typeof StaleWriteError
    | typeof ForbiddenOrNotFoundError
    | typeof RateLimitError
  )[] = [ValidationError, StaleWriteError, ForbiddenOrNotFoundError],
): (...args: Args) => Promise<State> {
  return async (...args: Args) => {
    try {
      return await fn(...args);
    } catch (err) {
      if (errorClasses.some((ErrorClass) => err instanceof ErrorClass)) {
        return { error: (err as Error).message } as State;
      }
      throw err;
    }
  };
}

// Owner only — deleting the trip and managing sharing itself. Memoized per
// tripId for the same reason as requireTripAccess above.
export const requireTripOwner = cache(async (tripId: string) => {
  const userId = await currentUserId();
  const trip = await db.trip.findFirst({ where: { id: tripId, userId } });
  if (!trip) throw new ForbiddenOrNotFoundError();
  return trip;
});
