/**
 * The `<main>` class strings that pages share with their loading skeletons
 * (TRIP-UX-7) and the header's width rule (TRIP-UX-6). One place, so a page
 * and the skeleton that stands in for it cannot drift apart and make the
 * layout jump when the data arrives.
 *
 * `narrow` is the text-width shell (lists, forms, settings, places); `wide`
 * is the two-pane shell of the trip page, which needs room for the itinerary
 * beside a map. `shared` is the same width with the public view's own
 * vertical padding.
 * @packageDocumentation
 */

export const PAGE_SHELL = {
  narrow: 'flex-1 w-full max-w-3xl mx-auto py-8 px-4 sm:py-16 sm:px-8',
  wide: 'flex-1 w-full max-w-6xl mx-auto py-4 px-4 sm:py-8 sm:px-8',
  shared: 'flex-1 w-full max-w-6xl mx-auto py-6 px-4 sm:py-10 sm:px-8',
} as const;

/**
 * The trip page's grid (TripLayout) and the same grid in its loading skeleton:
 * one column on a phone, itinerary beside a 26rem side column from `lg`.
 */
export const TRIP_GRID =
  'flex flex-col gap-6 lg:grid lg:grid-cols-[minmax(0,1fr)_26rem] lg:grid-rows-[auto_auto_1fr_auto] lg:gap-x-8 lg:gap-y-4';

/** Width of the header's inner row, matching the page under it. */
export const HEADER_WIDTH = {
  narrow: 'max-w-3xl',
  wide: 'max-w-6xl',
} as const;

// `/trips/<id>` (the itinerary) is the one authed page on the wide shell.
// `new` is a sibling of `[id]` and is a plain form.
export function isWidePath(pathname: string): boolean {
  return /^\/trips\/(?!new$)[^/]+$/.test(pathname);
}
