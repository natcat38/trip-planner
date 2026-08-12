import type { Metadata } from 'next';
import { InvalidShareLinkError } from '@/server/errors';
import { getSharedBudgetSummary, getSharedTrip } from '@/server/sharing';
import { SharedTripView } from './SharedTripView';

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
        <p className="text-zinc-600 dark:text-zinc-400">This link is no longer valid.</p>
      </div>
    );
  }

  let data;
  let budget;
  try {
    [data, budget] = await Promise.all([
      getSharedTrip(token),
      getSharedBudgetSummary(token),
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

  return <SharedTripView data={data} budget={budget} />;
}
