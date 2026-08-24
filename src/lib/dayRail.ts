/**
 * Pure "now/next" day-rail selection logic for ItineraryDays.tsx (ADR-0019
 * §2 open question 3). Extracted so it can be unit tested against a fixed,
 * injected `now` rather than the wall clock.
 *
 * Day.date is stored as UTC midnight (the same convention formatDay/
 * formatDateRange pin to) and Activity.startTime is a bare "HH:MM" with no
 * zone — the app deliberately stores no destination timezone (ADR-0018).
 * There is therefore no way to compute "is it activity X's time right now
 * at the destination" from stored data alone.
 *
 * The choice made here: compare the viewing device's own current UTC
 * date/time against those UTC-pinned values, rather than the device's
 * *local* calendar day. This was a real bug in an earlier version of this
 * file — comparing a UTC-pinned Day.date against the viewer's local Y-M-D
 * broke in both directions: east of UTC the local date rolls over before
 * the UTC one does, so a day that hasn't started yet (by the convention
 * used everywhere else) got badged "Today" hours early; west of UTC,
 * yesterday's day kept showing "Today" for hours after it was over. A pure
 * UTC/UTC comparison is deterministic and direction-agnostic: it's exactly
 * right for a destination in (or close to) UTC, and its error is bounded
 * and symmetric elsewhere, rather than confidently wrong.
 * @packageDocumentation
 */

// Minimal shape this module needs from an Activity — kept local rather than
// importing ItineraryDays.tsx's Prisma-derived `Days` type so this stays a
// plain, independently testable module.
export interface RailActivity {
  id: string;
  startTime: string | null;
  costMinor: number | null;
  costCurrency: string | null;
}

// True when `dayDate`'s UTC calendar day matches `now`'s UTC calendar day.
export function isToday(dayDate: Date, now: Date): boolean {
  return (
    dayDate.getUTCFullYear() === now.getUTCFullYear() &&
    dayDate.getUTCMonth() === now.getUTCMonth() &&
    dayDate.getUTCDate() === now.getUTCDate()
  );
}

// First activity (in existing sortOrder) whose startTime hasn't passed yet,
// compared against `now`'s UTC wall-clock time. Activities with no
// startTime can't be compared and are skipped when looking for "next", but
// don't block ones after them.
export function nextActivityId(
  activities: RailActivity[],
  now: Date,
): string | null {
  const pad = (n: number) => String(n).padStart(2, '0');
  const hhmm = `${pad(now.getUTCHours())}:${pad(now.getUTCMinutes())}`;
  for (const activity of activities) {
    if (activity.startTime && activity.startTime >= hhmm) {
      return activity.id;
    }
  }
  return null;
}

// Day cost subtotal (rail "station stop" figure): grouped by currency, never
// converted or summed across currencies — ADR-0018/money rules forbid
// treating e.g. JPY and USD minor units as fungible. Pure integer addition
// per currency bucket, same costMinor values BudgetPanel/ExpenseForm already
// render elsewhere; nothing here reads/writes stored data or does any
// division/float math. A day with activities in two currencies renders two
// figures ("¥3,000 + $20"), not a wrong merged total.
export function daySubtotals(
  activities: RailActivity[],
): { currency: string; minor: number }[] {
  const totals = new Map<string, number>();
  for (const activity of activities) {
    if (activity.costMinor != null && activity.costCurrency) {
      totals.set(
        activity.costCurrency,
        (totals.get(activity.costCurrency) ?? 0) + activity.costMinor,
      );
    }
  }
  return [...totals.entries()].map(([currency, minor]) => ({
    currency,
    minor,
  }));
}
