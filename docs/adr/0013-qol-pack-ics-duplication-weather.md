# ADR-0013: ICS export, trip duplication, and honest weather fallback

**Status:** Accepted (2026-08-20)

## Context
Milestone 5 is a quality-of-life pack of independent features (handoff §8). The first three were
chosen on value rather than order: two are confirmed gaps in the main competitor, and the third is
what travellers actually check.

- **Calendar export** — Wanderlog has none at any tier (§3.10). RFC 5545 is a few dozen lines by
  hand, so the value-to-effort ratio is the best in the pack.
- **Trip duplication** — also absent from Wanderlog, confirmed via its founders' own forum replies
  (§3.10). Useful for repeat trips and for turning someone else's shared itinerary into your own.
- **Weather** — Open-Meteo is keyless and fits the existing third-party pattern exactly.

Verified live before building, per the discipline in ADR-0010:

- Open-Meteo's forecast endpoint works keyless and returns WMO codes, max/min temperature and
  precipitation probability.
- **The forecast only reaches 16 days out.** `forecast_days=17` is a hard HTTP 400
  (`"Allowed range 0 to 16"`), and a 2027 range returns
  `"Parameter 'start_date' is out of allowed range from 2026-05-19 to 2026-09-04"`.
- The archive endpoint answers the same shape for past dates, up to roughly yesterday, but reports
  precipitation as millimetres rather than a probability.

That 16-day ceiling is the finding that shaped the design: **most trip planning happens further
ahead than the forecast can see**, so "no forecast available" is the common case, not an edge case.

## Decision

### 1. ICS export uses floating local time
`GET /trips/[id]/calendar.ics` returns RFC 5545 built by hand — no library. Timed events use
**floating** time (no trailing `Z`, no `TZID`), because `Day.date` is stored as UTC midnight and
`Activity.startTime` is a bare `"09:30"` string: the app has never captured a destination timezone,
so there is no honest zone to stamp. Floating means "local wherever the calendar is read", which is
correct for a traveller at the destination and wrong only when previewing from home before
departure. Activities with no time become all-day events, whose `DTEND` is the next day per the
spec. `UID` is derived from the activity id so re-importing updates events instead of duplicating
them.

### 2. Duplication never copies the share token or collaborators
`duplicateTrip` copies trip fields, days, activities, places and expenses. It never copies:

- **`shareToken`** — it is `@unique`, so copying would both violate the constraint and hand the copy
  someone else's public URL. Copies start unshared.
- **`collaborators`** — they agreed to be on the original trip, not on a copy someone else made.
- **`userId`** — the copy belongs to whoever created it.

Copied activities are re-pointed at the **copied** places via an old-id → new-id map. Leaving them
pointed at the original trip's rows is a silent fault that only surfaces when the original is
deleted.

### 3. Cloning a shared trip inherits the sharing boundary rather than re-deriving it
`duplicateSharedTrip(token)` is built **on top of `getSharedTrip`**, so it can only copy what that
function already exposes: public trip fields, days, and activities. It cannot copy the saved-places
tray, expenses, or collaborators, because they never reach it. Re-querying the trip directly would
work today and drift tomorrow — the boundary is defined and tested in exactly one place
(CLAUDE.md's public-share rule), and this feature consumes it rather than restating it.

### 4. Weather degrades to last year's actuals, clearly labelled
Dates inside the forecast window get a real forecast. Dates beyond it get the **same calendar dates
one year earlier** from the archive API, carrying a `kind: 'historical'` discriminator that the UI
must surface as "last year on this date".

A historical reading is never presented as a forecast. This is the same rule as the Wikivoyage
coverage indicator (ADR-0008): degrade to something honest rather than something that merely looks
authoritative. Dates neither endpoint can answer are simply absent, and the day renders no weather
at all rather than a placeholder.

Forecast and historical dates are each resolved in a single batched request, not one per day.

## Consequences
- The ICS route is the app's **second route handler** (the first being Auth.js's). Serving a file is
  what route handlers are for; this is not a new pattern to be repeated for ordinary data reads,
  which remain Server Components and Server Actions.
- Floating time is a known ceiling, not an oversight. If real zone support is ever wanted,
  Open-Meteo already returns an IANA timezone for coordinates, which is a cheap upgrade path.
- Last year's actuals are a *sample*, not a climate normal — one year's weather, not an average.
  This is deliberate: one request, and honest to describe in a single sentence. Computing normals
  across N years would be more statistically proper and much harder to label truthfully in a UI.
- Duplication is a genuine write amplifier: a large trip copies every day, activity, place and
  expense in one transaction. Fine at personal scale; worth revisiting if trips ever get large.
- Open-Meteo data is CC BY 4.0 and must be credited wherever it appears.
