/**
 * The trip creation route: renders the shared TripForm bound to
 * `createTripAction`, the entry point for starting a new Trip aggregate.
 * @packageDocumentation
 */
import type { Metadata } from 'next';
import { createTripAction } from '../actions';
import { TripForm } from '../TripForm';

export const metadata: Metadata = {
  title: 'Create a trip · Trip Planner',
};

export default function NewTripPage() {
  return (
    <div className="flex flex-col flex-1 bg-surface">
      <main
        id="main"
        tabIndex={-1}
        className="flex-1 w-full max-w-3xl mx-auto py-16 px-8"
      >
        <h1 className="text-4xl font-semibold text-foreground mb-8">
          Create a trip
        </h1>
        <TripForm action={createTripAction} submitLabel="Create trip" />
      </main>
    </div>
  );
}
