# ADR-0005: Day generation is additive-only, never destructive

**Status:** Accepted (2026-07-24)

## Context
Tech Scope Task 5.1 calls for generating `Day` rows across a trip's date range, but doesn't
say what happens when a trip's `startDate`/`endDate` change after activities already exist on
some days. `Day` has `onDelete: Cascade` to `Activity`, so authoritatively regenerating a
trip's days from its current date range (deleting days outside the new range) would silently
delete any activities a user had already entered on those days.

## Decision
`ensureDaysForTrip(tripId)` only **adds** `Day` rows missing from `[startDate, endDate]`; it
never deletes existing ones, even if the trip's dates later shrink. It's idempotent and safe
to call on every itinerary page load (used this way in `src/app/trips/[id]/page.tsx`).

## Consequences
- No data loss: shrinking a trip's date range leaves any already-populated days (and their
  activities) in place, just outside the "official" range — an orphaned-day edge case, not a
  destructive one.
- Cheap to change later if a future milestone wants authoritative regeneration with an
  explicit confirmation step; this is not a hard commitment, just the safe default until
  someone asks for the other behavior.
