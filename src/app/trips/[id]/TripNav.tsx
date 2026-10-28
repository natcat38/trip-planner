/**
 * The header pieces shared by a trip's pages (TRIP-UX-15): a "Trips / name"
 * breadcrumb, then (under the title) the Itinerary | Places switch with the current page marked
 * (`aria-current="page"`), and, on the itinerary, the trip's own actions: one
 * "Export" menu and a single secondary "Edit trip" button. Replaces five
 * same-weight underlined links, one of which ("Back to trips") was not an
 * action at all.
 * @packageDocumentation
 */
import Link from 'next/link';
import { ExportMenu } from './ExportMenu';

const crumbLink = 'touch-target underline';

export function TripBreadcrumb({ tripName }: { tripName: string }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-1 text-sm text-muted-fg">
      <ol className="flex min-w-0 items-center gap-2">
        <li>
          <Link href="/trips" className={crumbLink}>
            Trips
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="min-w-0 truncate">
          {tripName}
        </li>
      </ol>
    </nav>
  );
}

export function TripTabs({
  tripId,
  current,
}: {
  tripId: string;
  current: 'itinerary' | 'places';
}) {
  const tab = (active: boolean) =>
    `touch-target inline-flex items-center border-b-2 px-1 text-sm sm:min-h-9 ${
      active
        ? 'border-accent font-medium text-foreground'
        : 'border-transparent text-muted-fg hover:text-foreground'
    }`;

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border">
      <nav aria-label="Trip sections" className="flex gap-4">
        <Link
          href={`/trips/${tripId}`}
          aria-current={current === 'itinerary' ? 'page' : undefined}
          className={tab(current === 'itinerary')}
        >
          Itinerary
        </Link>
        <Link
          href={`/trips/${tripId}/places`}
          aria-current={current === 'places' ? 'page' : undefined}
          className={tab(current === 'places')}
        >
          Places
        </Link>
      </nav>
      {current === 'itinerary' && (
        <div className="flex items-center gap-2 pb-1">
          <ExportMenu tripId={tripId} />
          <Link
            href={`/trips/${tripId}/edit`}
            className="touch-target rounded-full border border-border px-4 py-1.5 text-sm text-foreground hover:bg-surface-raised sm:min-h-9"
          >
            Edit trip
          </Link>
        </div>
      )}
    </div>
  );
}
