/**
 * The trip edit/delete route: loads a trip via `requireTripAccess`, then
 * binds its `updatedAt` into the update action so a stale-write attempt is
 * rejected per the optimistic-locking rule (ADR-0003).
 * @packageDocumentation
 */
import { notFound } from 'next/navigation';
import { minorUnitExponent } from '@/lib/money';
import {
  currentUserId,
  ForbiddenOrNotFoundError,
  requireTripAccess,
} from '@/server/auth-scope';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { deleteTripAction, updateTripAction } from '../../actions';
import { TripForm } from '../../TripForm';

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
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-16 px-8"
      >
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-8">
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
          <form action={boundDelete} className="mt-8">
            <ConfirmSubmitButton
              confirm="Delete this trip and all its days, activities, expenses and attachments? This cannot be undone."
              pendingLabel="Deleting…"
              className="text-sm text-red-600 dark:text-red-400 underline"
            >
              Delete trip
            </ConfirmSubmitButton>
          </form>
        )}
      </main>
    </div>
  );
}
