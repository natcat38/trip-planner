/**
 * The trip edit/delete route: loads a trip via `requireTripAccess`, then
 * binds its `updatedAt` into the update action so a stale-write attempt is
 * rejected per the optimistic-locking rule (ADR-0003).
 * @packageDocumentation
 */
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { minorUnitExponent } from '@/lib/money';
import {
  currentUserId,
  ForbiddenOrNotFoundError,
  requireTripAccess,
} from '@/server/auth-scope';
import { deleteTripAction, updateTripAction } from '../../actions';
import { TripForm } from '../../TripForm';
import { DeleteTripSection } from './DeleteTripSection';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  try {
    const trip = await requireTripAccess(id);
    return { title: `Edit ${trip.name} · Trip Planner` };
  } catch {
    return {};
  }
}

function toDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export default async function EditTripPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let trip;
  try {
    trip = await requireTripAccess(id);
  } catch (err) {
    // A forbidden trip and a missing trip render identically — notFound()
    // never leaks which one it was.
    if (err instanceof ForbiddenOrNotFoundError) notFound();
    throw err;
  }

  const isOwner = trip.userId === (await currentUserId());

  const boundUpdate = updateTripAction.bind(
    null,
    trip.id,
    trip.updatedAt.toISOString(),
  );
  const boundDelete = deleteTripAction.bind(null, trip.id);

  return (
    <div className="flex flex-col flex-1 bg-surface">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-16 px-8"
      >
        <h1 className="text-4xl font-semibold text-foreground mb-8">
          Edit trip
        </h1>
        <TripForm
          action={boundUpdate}
          submitLabel="Save changes"
          defaults={{
            name: trip.name,
            destinations: trip.destinations.join(', '),
            startDate: toDateInputValue(trip.startDate),
            endDate: toDateInputValue(trip.endDate),
            baseCurrency: trip.baseCurrency,
            budgetAmount: String(
              trip.budgetMinor / 10 ** minorUnitExponent(trip.baseCurrency),
            ),
          }}
        />
        {isOwner && (
          <DeleteTripSection tripName={trip.name} action={boundDelete} />
        )}
      </main>
    </div>
  );
}
