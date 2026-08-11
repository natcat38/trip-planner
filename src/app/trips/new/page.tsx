/**
 * The trip creation route: renders the shared TripForm bound to
 * `createTripAction`, the entry point for starting a new Trip aggregate.
 * @packageDocumentation
 */
import { createTripAction } from '../actions';
import { TripForm } from '../TripForm';

export default function NewTripPage() {
  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <main className="flex-1 w-full max-w-3xl mx-auto py-16 px-8">
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-8">
          Create a trip
        </h1>
        <TripForm action={createTripAction} submitLabel="Create trip" />
      </main>
    </div>
  );
}
