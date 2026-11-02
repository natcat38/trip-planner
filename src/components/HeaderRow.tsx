'use client';

/**
 * The header's inner row, as wide as the page under it (TRIP-UX-6): on the
 * trip page the content is 1152px wide, so a 768px header put "Trip Planner"
 * and "Sign out" 192px inside the page edges. The width follows the route
 * through `usePathname`, which is also correct on the server render, so
 * there is no flash. The children are server-rendered nodes passed through.
 * @packageDocumentation
 */
import { usePathname } from 'next/navigation';
import { HEADER_WIDTH, isWidePath } from './pageShell';

export function HeaderRow({ children }: { children: React.ReactNode }) {
  const width = isWidePath(usePathname())
    ? HEADER_WIDTH.wide
    : HEADER_WIDTH.narrow;
  return (
    <div
      className={`mx-auto flex w-full ${width} items-center justify-between gap-3 px-4 py-1 sm:px-8 sm:py-3`}
    >
      {children}
    </div>
  );
}
