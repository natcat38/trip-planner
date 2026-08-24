# ADR-0018: Shared trips are listable, and two Phase 3 open items stay closed

**Status:** Accepted (2026-08-21)

## Context
Milestone 8 closed three items carried over from the Phase 3 handoff
(`docs/phase-3-open-items-handoff.md`, since retired — every item was verified implemented or
dispositioned before deletion, 2026-08-24): the trip list's owner-only scope (§2.8), and two items
that only needed re-confirming rather than building — ICS timezone handling and database-size
monitoring. This records all three, because the trip-list change touched an authorization
predicate shared with ADR-0017, and the other two are decisions not to act, which are easy to
re-litigate later without a record of why.

## Decisions

### 1. Trip lists include accepted-collaborator trips, through one predicate shared with real access control
`listTrips` (`src/server/trips.ts`) and the extension's `listTripsForExtension`
(`src/server/extensionApi.ts`, called from `src/app/api/extension/trips/route.ts`) were both
owner-only — `where: { userId }` — so a collaborator's dashboard, and the extension's trip
picker, never showed a trip shared with them. That was pre-existing behaviour, surfaced rather
than introduced, per handoff §2.8.

The fix widens **listing only**. Trip deletion and sharing management still go through
`requireTripOwner` — nothing here changes who can write.

The first pass gave each of the two list queries its own copy of the "owner OR accepted
collaborator" `OR` clause. That is exactly the drift `src/server/auth-scope.ts`'s own comment on
`requireTripAccessForUser` warns about — a second copy of the predicate is how the list path and
the real access-control path stop agreeing on who has access. The fix was extraction:
`tripAccessWhere(userId, email)`, a plain function in `auth-scope.ts`, is now the **one**
definition of trip access, and `requireTripAccessForUser`, `listTrips`, and
`listTripsForExtension` all build their `where` from it — one authorization idiom, three call
sites.

The extraction surfaced a second bug on the way: `TripCollaborator.email` is lowercased at invite
time, but `User.email` is not — Auth.js applies no email transform, and GitHub does not force
lowercase — so a query that compares the session email to `collaborators.email` without
normalizing it silently fails to match a real collaborator whenever the two differ in case. Every
consumer needs the lowercased form, so `currentUserIdentity()` (`auth-scope.ts`) does that
normalization once and returns `{ userId, email }`. Unlike `currentUserEmail()`, a missing email
is not an error here: some accounts have none, and a "what can this user see" query should degrade
to owner-only, not throw.

### 2. ICS stays floating-local-time — re-confirmed, not reopened
`src/lib/ics.ts` still emits `DTSTART`/`DTEND` with no trailing `Z` and no `TZID`
(`DTSTART:20260901T093000`), because `Day.date` is stored as UTC midnight and `startTime` is a
bare `"09:30"` with no zone attached — the app has never stored a destination timezone. Floating
time is the correct reading for a traveller physically at the destination, which is what an
itinerary export is for.

Re-checked for this milestone rather than left as an old assumption: RFC 5545 requires a
`VTIMEZONE` component per unique `TZID` used in the calendar, so emitting zoned times is a
generator rewrite plus a schema migration plus a design decision for multi-timezone trips — a
milestone, not a tweak. Nothing found this milestone changes that calculus.

Upgrade path if ever wanted: Open-Meteo already returns the IANA zone for a lat/lng
(`timezone=auto` → the response's top-level `timezone` field, used today for weather in
`src/lib/research/weather.ts`) → add `Trip.timezone` via a Prisma migration → emit `TZID` plus a
`VTIMEZONE` block per zone in use.

### 3. Database-size monitoring is a trend script, not infrastructure
`npm run db:size` (`scripts/db-size.mts`) queries `pg_database_size(current_database())` against
whichever `DATABASE_URL` it's pointed at and warns past 384 MB (75% of Neon's 0.5 GB free-plan
cap), pointing at the Vercel Blob migration path recorded in ADR-0016 §1.

No monitoring service, cron job, or alerting was built. Neon measures its cap as its own "logical
data size" in the Neon console, which is the authoritative number — `pg_database_size` is a local
Postgres approximation, close enough to watch a trend but not to gate on. The script's own output
says so on every run. Building anything more than a manual trend check is not justified until the
number is closer to the cap.

### 4. A sign-out control now exists (supersedes ADR-0015 §5)
Also closed this milestone, outside the three items above: `AppHeader` + `SignOutButton` on every
authed route. ADR-0015 §5's "the app currently has no sign-out control anywhere" is left as-written
— ADRs are historical records of a decision at the time — but that statement no longer holds; the
button now clears the offline worker's caches directly via `postMessage`, and the redirect-based
cleanup it describes is the fallback for a session that simply expires.

## Consequences
- A collaborator's dashboard and the extension's trip picker now agree with each other and with
  `requireTripAccess` on which trips are visible; before this, three different scopes existed
  (session dashboard, extension picker, real access control) and only the third was correct.
- `tripAccessWhere` is now the one place that defines "owner or accepted collaborator" — a future
  change to that rule (e.g. a collaborator role model) is a one-function change, not a grep.
- Calendar exports remain unusable as a source of truth for multi-timezone trips (e.g. an
  overnight flight crossing zones); this is accepted, not fixed, until the upgrade path above is
  taken.
- `npm run db:size` is a manual/CI-optional trend check, not an alert — someone has to run it or
  wire it into a scheduled job for it to catch a slow leak before the Neon console does.
