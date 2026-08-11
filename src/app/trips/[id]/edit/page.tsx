/**
 * The trip edit/delete route: loads a trip via `requireTrip`, then binds its
 * `updatedAt` into the update action so a stale-write attempt is rejected
 * per the optimistic-locking rule (ADR-0003).
 * @packageDocumentation
 */
import { minorUnitExponent } from '@/lib/money';
import { ForbiddenOrNotFoundError, requireTrip } from '@/server/auth-scope';
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
    trip = await requireTrip(id);
  } catch (err) {
    if (err instanceof ForbiddenOrNotFoundError) {
      return (
        <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
          <p className="text-zinc-600 dark:text-zinc-400">{err.message}</p>
        </div>
      );
    }
    throw err;
  }

  const boundUpdate = updateTripAction.bind(
    null,
    trip.id,
    trip.updatedAt.toISOString(),
  );
  const boundDelete = deleteTripAction.bind(null, trip.id);

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <main className="flex-1 w-full max-w-3xl mx-auto py-16 px-8">
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
        <form action={boundDelete} className="mt-8">
          <button
            type="submit"
            className="text-sm text-red-600 dark:text-red-400 underline"
          >
            Delete trip
          </button>
        </form>
      </main>
    </div>
  );
}
