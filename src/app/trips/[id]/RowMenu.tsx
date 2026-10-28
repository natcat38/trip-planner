'use client';

import type { ReactNode } from 'react';
import { PopoverMenu } from '@/components/PopoverMenu';

// The "more actions" button on an activity row (TRIP-UX-10): move, edit, pin
// colour and delete behind one 36px (44px on a phone) control instead of
// five on every row. The items are server-rendered forms passed in as
// children.
export function RowMenu({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <PopoverMenu
      label={label}
      trigger={
        <svg
          aria-hidden="true"
          viewBox="0 0 20 20"
          width="18"
          height="18"
          fill="currentColor"
        >
          <circle cx="4" cy="10" r="1.6" />
          <circle cx="10" cy="10" r="1.6" />
          <circle cx="16" cy="10" r="1.6" />
        </svg>
      }
      triggerClassName="inline-flex h-11 w-11 items-center justify-center rounded-full text-muted-fg hover:bg-surface hover:text-foreground sm:h-9 sm:w-9"
    >
      {children}
    </PopoverMenu>
  );
}
