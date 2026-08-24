/**
 * The public share-link route: a fully anonymous, session-less read-only
 * view of a trip's itinerary and budget, reached only by its `shareToken`.
 * The only route in the app with no auth gate (`src/proxy.ts`'s matcher
 * excludes it) — its data must never carry more than a visitor should see.
 * @packageDocumentation
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeToggle } from '@/app/ThemeToggle';
import { currentUserId, UnauthenticatedError } from '@/server/auth-scope';
import { InvalidShareLinkError } from '@/server/errors';
import {
  getSharedBudgetSummary,
  getSharedTrip,
  listSharedExpenses,
} from '@/server/sharing';
import { SharedTripView } from './SharedTripView';

// The share route has no auth gate at all (see the file header below), so a
// visitor may or may not be signed in. "Save a copy" only makes sense for a
// signed-in visitor — duplicateSharedTrip requires an account to own the
// copy — so the page checks this itself rather than letting an anonymous
// visitor hit a broken button.
async function isSignedIn(): Promise<boolean> {
  try {
    await currentUserId();
    return true;
  } catch (err) {
    if (err instanceof UnauthenticatedError) return false;
    throw err;
  }
}

export async function generateMetadata(): Promise<Metadata> {
  return { robots: { index: false, follow: false } };
}

// Shared by both the empty-token guard and the InvalidShareLinkError catch
// below. Deliberately does NOT link to /trips: a visitor here may well be
// signed out (this is the one route with no auth gate — see the file header
// comment), and /trips would just bounce them into sign-in over a dead link
// they never meant to use the app from. "/" is the public, auth-free
// landing page every visitor can actually load. The exact copy
// ("This link is no longer valid.") is asserted by e2e/sharing.spec.ts —
// keep it verbatim.
function InvalidShareLink() {
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-zinc-950">
      {/* No AppHeader — this route has no auth gate at all (see the file
          header comment above). Same minimal chrome as the other
          auth-agnostic routes (/, and SharedTripView's own chrome for a
          valid token). */}
      <div className="flex w-full justify-end px-4 py-3 sm:px-8 print:hidden">
        <ThemeToggle />
      </div>
      <main
        id="main"
        tabIndex={-1}
        className="flex flex-1 flex-col items-center justify-center gap-4 px-8 py-16 text-center"
      >
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
          Link not found
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400">
          This link is no longer valid.
        </p>
        <Link
          href="/"
          className="text-sm text-zinc-600 underline dark:text-zinc-400"
        >
          Go to Trip Planner
        </Link>
      </main>
    </div>
  );
}

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!token) {
    return <InvalidShareLink />;
  }

  let data;
  let budget;
  let expenses;
  let canSaveCopy;
  try {
    [data, budget, expenses, canSaveCopy] = await Promise.all([
      getSharedTrip(token),
      getSharedBudgetSummary(token),
      listSharedExpenses(token),
      isSignedIn(),
    ]);
  } catch (err) {
    if (err instanceof InvalidShareLinkError) {
      return <InvalidShareLink />;
    }
    throw err;
  }

  return (
    <SharedTripView
      data={data}
      budget={budget}
      expenses={expenses}
      token={token}
      canSaveCopy={canSaveCopy}
    />
  );
}
