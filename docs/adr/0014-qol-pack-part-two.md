# ADR-0014: Checklists, day notes, votes, pin colours, and a theme toggle

**Status:** Accepted (2026-08-20)

## Context
The remainder of the Milestone 5 quality-of-life pack (handoff §8). Individually small; the
decisions worth recording are the ones about where data lives and who can see it.

## Decisions

### 1. `Day.notes` is deliberately public
`getSharedTrip` returns whole `Day` rows, so adding a `notes` column puts it on the world-readable
`/shared/[token]` route. That is intended: day notes are itinerary content, exactly like
`Activity.notes`, which has been public since Phase 2. A shared itinerary that hides the day's own
plan is less useful than one that shows it.

The risk is that the *next* field added to `Day` inherits this silently, so the schema carries a
comment at the column saying so. CLAUDE.md's rule stands: anything reachable from that route is
world-readable, and the check belongs at the schema and `src/server/sharing.ts`, not at the
component layer.

### 2. Votes are keyed by email and are not published
`ActivityVote` uses `voterEmail` rather than a `User` foreign key, for the same reason as
`TripCollaborator` (ADR-0006): collaborators are matched by verified OAuth email and may have no
account row. The voter identity always comes from `currentUserEmail()` server-side and is never
accepted from the client.

Presence *is* the vote — un-voting is a delete, so there is no value column to keep consistent. A
racing double-submit hits the `@@unique([activityId, voterEmail])` constraint, and that specific
violation is treated as a no-op success rather than a 500.

**Votes are not exposed on `/shared/[token]`.** Who liked what is group deliberation, not published
output, and the public payload is deliberately not extended to carry it.

### 3. Duplication copies the checklist and the notes, but not the votes
A packing list is the most reusable thing about a trip — copying one to plan a similar trip is the
point of the feature. Day notes travel too, in both `duplicateTrip` and `duplicateSharedTrip` (in
the latter only because `getSharedTrip` already exposes them; the boundary still decides).

Votes deliberately do not. An `ActivityVote` is a person's opinion about the original trip, and it
is not ours to transplant onto a copy they may never see.

### 4. Pin colour is validated as hex, server-side
The value reaches a style attribute, so an unvalidated string is a CSS-injection route. Only a
3- or 6-digit hex literal is accepted, or null to clear; anything else is a `ValidationError`
before any write. The UI offers a fixed palette rather than a free-text field, which is friendlier
*and* keeps the common path inside the validated set.

`src/components/Map.tsx` gains an optional `color` on its pin type and nothing else — it stays a
presentational pins-in/map-out component with no Trip or Activity coupling, which is the property
that let the places tray reuse it in M1.

### 5. Theme preference lives in `localStorage`, not Postgres
A display preference is not trip data. Storing it per-user would also mean it could not apply to
signed-out pages, and `/shared/[token]` is explicitly one of those.

Tailwind 4 configures dark mode in CSS rather than a JS config, so the class strategy is set with
`@custom-variant dark (&:where(.dark, .dark *))`. The default remains **system**, so anyone who
never touches the control keeps today's behaviour.

**The flash of wrong theme is the whole difficulty.** A React-state implementation paints light and
then flips after hydration on every page load, so the applied class is set by a small
render-blocking inline script in `<head>` before first paint. That script looks exactly like
something a tidy-minded person would later "clean up" into a `useEffect`, which would silently
reintroduce the flash — so it is commented to say so.

## Consequences
- Adding any field to `Day` now needs the same "is this public?" thought that adding to
  `getSharedTrip`'s include does. The schema comment is the reminder.
- Votes are only meaningful on trips with collaborators; on a solo trip the control is a private
  bookmark. Acceptable — it costs nothing and needs no separate mode.
- `suppressHydrationWarning` on `<html>` is required by the no-flash script, and does mean genuine
  hydration mismatches on that element would be silenced. It is scoped to the one element that
  legitimately differs between server and client.
