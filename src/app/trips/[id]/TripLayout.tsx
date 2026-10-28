/**
 * Where a trip page's parts sit (TRIP-UX-5, decision D2): the itinerary is the
 * page, the rest is arranged around it.
 *
 * From `lg`, two columns: the itinerary on the left with the checklist and
 * attachments under it; on the right the budget summary, the sharing panel
 * (owner only) and the map, which stays in view while the itinerary scrolls.
 * On a phone one column, in DOM order: budget summary bar, map, itinerary,
 * then sharing, checklist and attachments as collapsed sections at the
 * bottom.
 *
 * The parts are slots, not duplicated markup: each is rendered once and only
 * moved by the grid, so there is one set of forms and one tab order.
 * @packageDocumentation
 */
import type { ReactNode } from 'react';

export function TripLayout({
  budget,
  map,
  days,
  sharing,
  extras,
}: {
  budget: ReactNode;
  map: ReactNode;
  days: ReactNode;
  /** Owner-only; omit for a collaborator. */
  sharing?: ReactNode;
  /** Checklist and attachments. */
  extras: ReactNode;
}) {
  return (
    // Rows from lg: budget, sharing, map (takes the spare height so its
    // sticky child has room to travel), extras. The itinerary spans the
    // first three. `min-w-0` on the left column stops a long place name from
    // widening it past its track.
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-[auto_auto_1fr_auto] lg:gap-x-8 lg:gap-y-4">
      <div className="lg:col-start-2 lg:row-start-1">{budget}</div>
      <div className="lg:col-start-2 lg:row-start-3">
        {/* top-20 clears the sticky header (about 53px) and the offline
            banner's space. */}
        <div className="lg:sticky lg:top-20">{map}</div>
      </div>
      <div className="min-w-0 lg:col-start-1 lg:row-span-3 lg:row-start-1">
        {days}
      </div>
      {sharing && (
        <div className="lg:col-start-2 lg:row-start-2">{sharing}</div>
      )}
      <div className="flex min-w-0 flex-col gap-4 lg:col-start-1 lg:row-start-4">
        {extras}
      </div>
    </div>
  );
}
