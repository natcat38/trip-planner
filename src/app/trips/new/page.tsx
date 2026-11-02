/**
 * The trip creation route: renders the shared TripForm bound to
 * `createTripAction`, the entry point for starting a new Trip aggregate.
 * @packageDocumentation
 */
import type { Metadata } from 'next';
import Link from 'next/link';
import { createTripAction } from '../actions';
import { TripForm } from '../TripForm';
import { PAGE_SHELL } from '@/components/pageShell';

export const metadata: Metadata = {
  title: 'Create a trip',
};

export default function NewTripPage() {
  return (
    <div className="flex flex-col flex-1 bg-surface">
      <main id="main" tabIndex={-1} className={PAGE_SHELL.narrow}>
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="text-4xl font-semibold text-foreground">
            Create a trip
          </h1>
          <Link href="/trips" className="text-sm text-muted-fg underline">
            Cancel
          </Link>
        </div>
        <TripForm action={createTripAction} submitLabel="Create trip" />
      </main>
    </div>
  );
}
