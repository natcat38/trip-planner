/**
 * The "owner OR an accepted collaborator" trip-access predicate — split out
 * of auth-scope.ts into its own import-light module so unit tests can import
 * the real function directly instead of reimplementing its shape inside a
 * `vi.mock` factory. auth-scope.ts pulls in `auth` from '../auth', which
 * transitively needs next-auth and next/server; those aren't resolvable in
 * the plain vitest unit-test environment (see trips.test.ts /
 * extensionApi.test.ts), so a test that needs the real predicate but not a
 * real session has to reach it through a module that avoids that import.
 * @packageDocumentation
 */
import type { Prisma } from '../generated/prisma/client';

// See auth-scope.ts's requireTripAccessForUser for why this is the one
// definition of trip access in the codebase — every caller (that function,
// plus the trip list queries in trips.ts/extensionApi.ts) builds its `where`
// from this helper instead of writing the OR shape out again.
export function tripAccessWhere(
  userId: string,
  email: string | undefined,
): Prisma.TripWhereInput {
  return {
    OR: [
      { userId },
      ...(email
        ? [{ collaborators: { some: { email, status: 'ACCEPTED' as const } } }]
        : []),
    ],
  };
}
