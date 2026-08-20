/**
 * The public share-link route: a fully anonymous, session-less read-only
 * view of a trip's itinerary and budget, reached only by its `shareToken`.
 * The only route in the app with no auth gate (`src/proxy.ts`'s matcher
 * excludes it) — its data must never carry more than a visitor should see.
 * @packageDocumentation
 */
import type { Metadata } from 'next';
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

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  if (!token) {
    return (
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <p className="text-zinc-600 dark:text-zinc-400">
          This link is no longer valid.
        </p>
      </div>
    );
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
      return (
        <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
          <p className="text-zinc-600 dark:text-zinc-400">{err.message}</p>
        </div>
      );
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
