'use client';

import Link from 'next/link';
import { PopoverMenu } from '@/components/PopoverMenu';

const itemClass =
  'flex min-h-11 items-center rounded px-3 text-sm text-foreground hover:bg-surface sm:min-h-9';

// Export PDF and Add to Calendar behind one control (TRIP-UX-15): two
// same-weight links in the trip header were noise next to the actions that
// matter.
export function ExportMenu({ tripId }: { tripId: string }) {
  return (
    <PopoverMenu
      label="Export"
      trigger={
        <>
          Export
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 7.5 10 12.5 15 7.5" />
          </svg>
        </>
      }
      triggerClassName="inline-flex min-h-11 items-center gap-1 rounded-full border border-border px-4 py-1.5 text-sm text-foreground hover:bg-surface-raised sm:min-h-9"
      panelClassName="w-48"
    >
      <Link href={`/trips/${tripId}/print`} className={itemClass}>
        Export PDF
      </Link>
      <Link href={`/trips/${tripId}/calendar.ics`} className={itemClass}>
        Add to Calendar
      </Link>
    </PopoverMenu>
  );
}
