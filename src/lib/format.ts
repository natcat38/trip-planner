/**
 * Shared date-formatting helpers (ADR-0019 §3). `formatDay`/`formatDateRange`
 * were duplicated verbatim across `trips/page.tsx`, `trips/[id]/print/page.tsx`,
 * and `shared/[token]/SharedTripView.tsx` — consolidated here.
 *
 * `Day.date`/`Trip.startDate`/`Trip.endDate` are stored as UTC midnight and
 * mean a calendar day, not a moment in time — `formatDay` pins `timeZone:
 * 'UTC'` so the same date reads the same everywhere regardless of
 * viewer/server TZ; dropping that pin would shift dates by a day for
 * viewers west of UTC.
 *
 * Both formatters use `undefined` for locale (not a hardcoded `'en-US'`) so
 * output follows the viewer's own locale. That's only safe here because
 * every current caller (`trips/page.tsx`, `trips/[id]/print/page.tsx`,
 * `shared/[token]/SharedTripView.tsx`) is a Server Component: it renders
 * once, server-side, with no client-side hydration pass to disagree with.
 *
 * Do NOT reach for these from a `'use client'` component. Next.js SSRs a
 * client component once for the initial HTML and again in the browser
 * during hydration; `undefined` lets each environment resolve its own
 * default locale, and if server and client disagree, the two renders
 * produce different text — React then discards and rebuilds the whole
 * subtree, breaking any interactive state under it. `ItineraryDays.tsx`
 * (itinerary day headings), `places/DayPlanner.tsx` and
 * `places/PlaceRow.tsx` (day-option pickers), and `trips/[id]/Attachments.tsx`
 * (upload timestamps) hit exactly this in testing when they briefly used a
 * shared `undefined`-locale formatter — they keep their own local
 * formatters with the locale hardcoded to `'en-US'` instead, deliberately
 * un-consolidated. Same for `settings/AiKeyPanel.tsx` and
 * `settings/ExtensionTokenPanel.tsx`'s "saved"/"created" date formatters.
 * @packageDocumentation
 */

export function formatDay(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatDateRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

// Inclusive trip length from the trip's own dates (stored as UTC midnight).
// Not the Day-row count: Day rows are only materialised when a trip page is
// opened, and never deleted when dates shrink (ADR-0005), so that count reads
// 0 for a never-opened trip and too high after a date change.
export function tripLengthDays(start: Date, end: Date): number {
  const utcDay = (d: Date) =>
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return Math.round((utcDay(end) - utcDay(start)) / 86_400_000) + 1;
}
