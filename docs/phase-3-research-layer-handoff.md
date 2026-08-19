# Phase 3 Handoff — Destination Research & Saved-Places Tray

> **Status:** planned, not implemented. Nothing in this document has been built.
> **Written:** 2026-08-19. **Audience:** a fresh session picking this up cold.
> **Read first:** `CLAUDE.md`, `docs/Trip_Planner_Tech_Scope.md` §2, `docs/adr/`, `knowledge/index.md`.

This document exists because the research behind it was expensive and most of its value is in
what it **ruled out**. A cold session that skips to the plan will re-propose ideas that were
already tested and falsified. Read §3 before §5.

---

## 1. The ask

Intent from the user:

> The idea for trip planner was to generate and research multiple options of each day but be as
> functional as what wanderlog.com offers. The research bit would include what restaurants to eat
> at, average cost of meal. Visiting a location — how to get there, do you need to buy tickets to
> enter, what mode of transport is available. It's more like a one-platform thing where I don't
> need to open multiple tabs to research and everything is in trip-planner. I still want
> everything free.

Three concrete questions the product must answer about a place:

1. Where should I eat, and what does a meal cost?
2. Does this attraction need tickets, and what is admission?
3. How do I get there, and what transport exists?

Plus a hard constraint: **$0/month** (ADR-0001), and a stated preference for using free AI
tooling, either externally or built into the app for users to search and approve.

## 2. Where the app is today

Phase 1 and Phase 2 are complete and merged. The app is a *recording* tool — you already know
what you want to do and you type it in. There is no research or discovery layer of any kind.

Relevant existing shape (verified, not assumed):

- **Stack:** Next.js 16.2.11 App Router + TS + Tailwind 4 · Prisma 7.9 (`prisma-client`
  generator, `moduleFormat = "cjs"`) · Postgres · Auth.js v5 · Vitest + Playwright.
- **Mutations are Server Actions**, not API routes. The only route handler is Auth.js's.
- **Models:** `User`, `Trip`, `Day`, `Activity`, `Expense`, `TripCollaborator`. No `Json`
  columns anywhere. No AI SDK in `package.json`.
- **Authorization core** is `src/server/auth-scope.ts` — `requireTripAccess(tripId)` /
  `requireTripOwner(tripId)`, both `cache()`-wrapped.
- **Third-party call house pattern** (`src/lib/fx.ts`, `src/lib/geocode.ts`): server-only,
  env var via `requireEnv`, **never throws** — returns `null` on failure — module-level cache.
- **No UI primitives at all.** No shadcn, no `components/ui`, no `Button`/`Dialog`/`Card`, no
  toast system, no `loading.tsx`/`error.tsx`, no `useOptimistic`. Every control is a raw
  hand-styled element. Editing is route-based (`/trips/[id]/activities/[activityId]/edit`),
  disclosure is native `<details>`.
- **`src/components/Map.tsx`** takes `{ pins: {id,lat,lng,title}[], selectedId?, onSelectPin? }`
  — purely presentational, no Activity coupling, reusable for arbitrary pins.

## 3. Verification findings — READ THIS BEFORE PLANNING ANYTHING

A first draft of this plan was written from reasonable-sounding assumptions. Three verification
agents were then dispatched to falsify them. **Six assumptions failed.** These are the most
valuable part of this document.

### 3.1 OpenStreetMap has no price data. At all.

Tested live against Fukuoka via the Overpass API.

| Tag | Presence in sample |
| --- | --- |
| `name` | ~100% |
| `cuisine` | ~40–60% |
| `opening_hours` | ~10–50% (varies by sub-area) |
| `website` | ~10–15% |
| `phone` | ~10–20% |
| **any price/cost tag** | **0 of 83 restaurants** |

Attractions: the `fee` tag appeared on **3 of 106 (2.8%)**, and is binary `yes`/`no` — never an
amount. The `charge` key (OSM's actual admission-cost key) did not appear at all.

**Consequence:** Overpass is a name/location/cuisine/hours lookup. It is *not* a pricing or
ticketing source and must never be presented as one. Any plan that says "we'll read `fee` from
OSM" is wrong.

**Operational note:** `overpass-api.de` returned 504 twice under moderate load before
succeeding on a tighter bbox. A mirror fallback (`https://overpass.kumi.systems/api/interpreter`)
and an explicit timeout are required, not optional.

### 3.2 Wikivoyage is the real data source — but coverage craters for small places

Wikivoyage is hand-written, CC BY-SA travel-guide content and it genuinely contains what the
user asked for. Verified excerpts:

- Fukuoka, *Get around*: an all-day subway pass costs ¥640; regular tickets ¥210–380.
- Fukuoka, *See*: Fukuoka Tower ¥1000; the Japanese Garden ¥190 for foreign visitors.
- Fukuoka, *Eat*: structured into Budget / Mid-range / Splurge, with figures like "most dishes
  around ¥700-800".
- Lisbon: comparable richness — Santa Justa Lift "€5 (round trip ticket)", single journey
  "as little as €1.75".

**But:** Yubari, Hokkaido (pop. ~7,000, rated "usable article", one tier above stub) has a
literally **empty** *Get around* section, exactly one attraction in *See* with **no** fee
information, and one priced menu item on the entire page.

**Consequence:** the feature works well for major cities and degrades to near-nothing for small
ones. The UI must detect this and say so, or small-destination trips will look broken.

### 3.3 "Average meal cost" is not obtainable from anything free

No source in this stack provides a computable average. Wikivoyage gives *sample* prices in
prose. This framing must be dropped from the product language — show sample prices with
attribution, never a computed average.

### 3.4 Gemini's free tier is not usable for this app — ToS blocker

Quoted directly from Google's Gemini API Terms of Service:

> "You may use only Paid Services when making API Clients available to users in the European
> Economic Area, Switzerland, or the United Kingdom."

That clause binds **the application**, not the end user's account status. This is a
Japan/**Europe** trip planner, so European users are in scope by definition. A user pasting
their own free-tier key does not cure it — the app is still the "API Client made available".

It also fails **silently**: the API call succeeds, and the breach only surfaces on audit.

Additionally, on the free (Unpaid) tier Google states it uses submitted content to improve its
products and that "human reviewers may read, annotate, and process your API input and output".
Trip data can contain hotel names and travel-companion names, so this would need disclosure
even where the EEA clause does not bite.

**Could not verify** (stated as unresolved, not as permission): whether Google's terms permit an
end user to hand their personal key to a third-party app that calls the API server-side. No
clause was found either way.

### 3.5 `createActivity` cannot accept known coordinates — would silently mis-place pins

`ActivityInput` in `src/server/itinerary.ts` has **no `lat`/`lng` fields**. `createActivity`
always calls `resolveActivityData(input)` with no `existing` argument, and:

```ts
if (placeName !== (existing?.placeName ?? null)) {
  const result = placeName ? await geocode(placeName) : null;
  lat = result?.lat ?? null;
  lng = result?.lng ?? null;
}
```

On create, `existing` is `undefined`, so any non-empty `placeName` triggers a Mapbox geocode.
Adding a saved OSM place — which already has exact coordinates — would fire a **text** lookup on
the name and could resolve to a different location than the one the user saved.

**Consequence:** reusing `createActivity` unmodified is unsafe. It needs a coordinate
passthrough first.

### 3.6 A `/settings` route would have shipped publicly accessible

`src/proxy.ts` in full:

```ts
export const proxy = auth((req) => {
  if (!req.auth) { /* redirect to sign-in */ }
});
export const config = { matcher: ['/trips/:path*'] };
```

The matcher is hard-scoped to `/trips/:path*`. A new `/settings` route would **not match**, so
the proxy would never run and the page would be **public** — while holding encrypted API keys.

**Consequence:** any future settings route must extend the matcher **and** carry an in-action
`currentUserId()` guard as defence in depth.

### 3.7 Smaller corrections

- **No `Json` columns exist** anywhere in `prisma/schema.prisma`. Adding one would be the first
  under Prisma 7's `prisma-client` generator with `moduleFormat = "cjs"` — an untested
  combination in this repo.
- **`*.db.test.ts` is a naming convention, not a separate suite.** `vitest.config.ts` uses
  `include: ['src/**/*.test.ts']`, which matches both. They run together under `npm run test`
  and need a live `DATABASE_URL`. CI already provisions `postgres:16-alpine`.
- **`getSharedTrip` is safe by omission**, not by filtering — it uses a narrow hand-written
  `include: { activities: ... }` and destructures off `userId`/`shareToken`. A new relation will
  not auto-appear, but anyone adding to that `include` must strip fields manually.
- **Gemini's REST surface has moved** to `POST /v1beta/interactions` with `response_format`
  (key in an `x-goog-api-key` header). The legacy `:generateContent` +
  `generationConfig.responseSchema` shape is **not deprecated** and remains fully supported.
  Do not write either from training memory — verify at implementation time.
- **Gemini free-tier rate limits are no longer published as a fixed table.** Google directs
  developers to their live AI Studio console. Do not hardcode limits; handle 429s.
- `next.config.ts` is empty/default. `export const maxDuration` is a per-route, Vercel-only
  segment hint and needs no config change.
- Wikipedia REST is keyless and works, but returns encyclopedic prose that answers none of the
  three product questions.

## 4. Decisions taken with the user

| Decision | Choice | Rationale |
| --- | --- | --- |
| LLM in v1 | **None** | If Wikivoyage *is* the price data and OSM has none, a model sources nothing — it only reformats prose we can render directly. Dropping it removes key storage, encryption, a settings route, quota handling and the entire ToS exposure from this milestone. |
| LLM later (milestone 2) | **OpenRouter and Gemini both** | One function, provider branch on key prefix; both are a single POST with a JSON schema. OpenRouter is the **default** — BYOK is a first-class supported flow there. Gemini requires an explicit EEA/UK/CH disclosure (see §3.4). |
| Grounding rule | **No user-visible fact may be model-generated** | Everything traces to OSM or Wikivoyage, or is `null`. |
| Thin coverage | **Coverage indicator, degrade honestly** | Never render an empty panel that looks broken. Falls back to OSM-places-only, which works globally. |
| "Multiple options per day" | **Saved-places tray first** | Multi-candidate day generation is a later milestone that composes from the tray. |
| Scope | **One vertical slice, end to end** | Prove the free-data stack before building UI on top of it. |

## 5. Milestone 1 plan

### 5.1 Data sources (v1)

Two. Both keyless, both verified live.

| Need | Source | Notes |
| --- | --- | --- |
| Places: name, coords, `cuisine`, `opening_hours`, `website`, `phone` | Overpass — `https://overpass-api.de/api/interpreter` | No prices. Mirror fallback + timeout required. Fair use <10k queries/day; send a real `User-Agent`; on 429 back off 30s. |
| Destination guide: *Eat*, *See*/*Do*, *Get around*, *Get in* | Wikivoyage — `https://en.wikivoyage.org/w/api.php` | Confirmed shape: `action=parse&page={title}&format=json&prop=sections` for the index, then `prop=wikitext&section={n}`. `prop=extracts` was **not** confirmed enabled — use sections+wikitext. |

### 5.2 Retrieval — `src/lib/research/`

Follows the `fx.ts` / `geocode.ts` house pattern: server-only, never throws, module-level cache.

- **`overpass.ts`** — `searchPlaces({ lat, lng, radius, category, query })` → `OsmPlace[]`.
  Bounded bbox + result limit, mirror fallback, `AbortSignal.timeout`. Also
  `nearestStation(lat, lng)` as a partial answer to "how do I get there".
- **`wikivoyage.ts`** — `getGuide(destination)` →
  `{ sections: { eat, see, do, getAround, getIn }, coverage }`. 24h in-memory `Map` cache
  mirroring `fx.ts`, with a `__resetGuideCacheForTests()` export matching
  `fx.ts`'s `__resetFxCacheForTests()`.

**No database table for guides.** Content changes slowly, MediaWiki is built for volume, cold
starts refetching is fine. Removes a model, a migration and a staleness problem.

`coverage: 'good' | 'thin' | 'none'` is derived from retrieved section character counts.
`thin`/`none` renders "Limited guide data for {destination}" and falls back to OSM places only.

### 5.3 Schema — `prisma/schema.prisma`

```prisma
model Place {
  id           String   @id @default(cuid())
  tripId       String
  source       String   // "osm" | "manual"
  sourceId     String?  // e.g. "node/1234567"
  name         String
  lat          Float
  lng          Float
  category     String   // same vocabulary as Activity.category
  cuisine      String?
  openingHours String?
  website      String?
  phone        String?
  notes        String?  // user's own research notes
  // Integer minor units + ISO 4217 per CLAUDE.md. Never a float.
  // User-entered: a price they read in the guide. No source gives this programmatically.
  costMinor    Int?
  costCurrency String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  trip Trip @relation(fields: [tripId], references: [id], onDelete: Cascade)
  @@unique([tripId, source, sourceId])
  @@index([tripId])
}
```

Plus `Activity.placeId String?` (nullable, `onDelete: SetNull`).

**Deliberately no `Json` column** — see §3.7. The needed fields are a small flat set, so typed
columns are both simpler and lower-risk. Revisit only for genuinely variable-shaped data.

Run `npx prisma migrate dev` after the schema edit.

### 5.4 Prerequisite — coordinate passthrough in `createActivity`

**Do this first; the tray depends on it.** Add optional `lat?: number; lng?: number` to
`ActivityInput` in `src/server/itinerary.ts`, and have `resolveActivityData` use them when both
are supplied instead of geocoding.

**When absent, behaviour must be byte-identical to today** — every existing form path passes no
coordinates. Guard with a regression test.

### 5.5 Server layer — `src/server/places.ts`

Mirrors `src/server/itinerary.ts`.

- `requirePlace(tripId, placeId)` — modelled on `requireActivity`: `requireTripAccess(tripId)`
  first, then `findFirst` scoped through the parent, then `ForbiddenOrNotFoundError`.
- `searchPlaces`, `savePlace`, `updatePlace`, `deletePlace`, `addActivityFromPlace`.
- **Every** function gates on `requireTripAccess(tripId)` — never by place id alone (CLAUDE.md).
- `addActivityFromPlace` calls the coordinate-aware `createActivity` so no geocode fires. Cost
  fields map straight across, so tray costs flow into `summarizeBudget` with no extra work
  (verified: it selects activities by `costMinor: { not: null }` with no source filtering).
- `updatePlace` carries `updatedAt` and rejects stale writes per ADR-0003:
  `updateMany({ where: { id, updatedAt }, data })` then
  `if (result.count === 0) throw new StaleWriteError()`.

### 5.6 Sharing boundary

The tray is a planning workspace, **not published output**. `getSharedTrip` is *not* extended to
include places, and a test asserts the shared payload contains none. Add a comment at that
`include` warning that anything added there is world-readable.

### 5.7 Auth surface

**No `/settings` route in this milestone** — it existed only to hold API keys, which v1 no
longer needs. The one new route, `/trips/[id]/places`, falls inside the existing
`matcher: ['/trips/:path*']` and is auth-gated with no proxy change.

Milestone 2 **must** extend the matcher before any settings route ships. See §3.6.

### 5.8 UI

No modal/dialog primitive exists and this milestone does not introduce one. Follow existing
patterns: dedicated route + `<details>` disclosures + plain `<form action={...}>`.

- `src/app/trips/[id]/places/page.tsx` — server component: destination guide panel with coverage
  indicator at the top, then OSM search, then the saved tray.
- Each saved place gets a day `<select>` → `addActivityFromPlaceAction`.
- Reuses `src/components/Map.tsx` **unchanged**.
- Link in from the trip page header — `src/app/trips/[id]/page.tsx` has a `flex gap-4` link row
  ("Export PDF", "Edit trip") that takes a third link with identical styling.
- **Attribution is required:** OSM is ODbL, Wikivoyage is CC BY-SA. Credit both in the panel.

### 5.9 Env & runtime

**No new env vars.** Overpass and Wikivoyage need no key; Mapbox is already configured.

Set `export const maxDuration = 60` on the places route — the Vercel Hobby default of 10s is a
real risk given observed Overpass 504s and retries.

### 5.10 Files

**Changed:** `prisma/schema.prisma`, `src/server/itinerary.ts` (coordinate passthrough),
`src/app/trips/[id]/page.tsx` (one link), `src/server/sharing.ts` (comment only).

**New:** `src/lib/research/overpass.ts`, `src/lib/research/wikivoyage.ts`,
`src/server/places.ts`, `src/app/trips/[id]/places/page.tsx`,
`src/app/trips/[id]/places/actions.ts`, plus tests.

## 6. Verification plan

Both `*.test.ts` and `*.db.test.ts` run under the same vitest glob and need a live
`DATABASE_URL`.

1. `overpass.test.ts` — tag parsing → `OsmPlace`; missing `cuisine` yields `null` not `""`;
   network failure returns `[]`; **primary-host failure falls through to the mirror**; timeout
   aborts cleanly.
2. `wikivoyage.test.ts` — section index → wikitext fetch; `coverage` returns `'good'` for a
   Fukuoka-sized fixture and `'thin'`/`'none'` for a Yubari-sized one; failure returns `null`;
   cache hit avoids a second fetch.
3. `itinerary.test.ts` (extend) — **regression:** create with no lat/lng still geocodes exactly
   as before; create *with* lat/lng does **not** call `geocode` and stores coordinates verbatim.
4. `places.test.ts` — every exported function refuses without `requireTripAccess`; bad currency
   codes rejected; stale `updatedAt` throws `StaleWriteError`.
5. `places.db.test.ts` — real Postgres, following the `itinerary.db.test.ts` boilerplate
   (`vi.mock('../auth')`, per-test user with a random email, `afterEach` deletes the user's trips
   then the user): trip delete cascades places; `@@unique([tripId, source, sourceId])` blocks a
   duplicate; a non-collaborator is denied.
6. `sharing.test.ts` (extend) — shared-trip payload exposes no places.
7. `e2e/places.spec.ts` — search → save → add to day → appears in itinerary with cost counted in
   the budget panel.

Manual check against the seeded Fukuoka trip:

```bash
docker compose up -d && npm run db:seed && npm run dev
```

Open the trip's Places tab. Confirm the guide panel shows real Wikivoyage figures — the subway
day pass should read ¥640. Search "ramen", save a result, pull it onto day 1, confirm the budget
total moves. Then temporarily set a destination to a small town and confirm the coverage
indicator degrades honestly instead of rendering an empty panel.

Full gate before opening a PR:

```bash
npm run lint && npm run format:check && npm run test && npm run test:e2e && npm run file-map:check
```

## 7. ADRs to write alongside the implementation

- **Grounded research, no generative layer (v1)** — record §3.1–3.3 and the rule that no
  user-visible fact may be model-generated.
- **Gemini free tier is unusable for EEA/UK/CH users** — quote the ToS clause from §3.4 so this
  is not rediscovered. Milestone 2 defaults to OpenRouter.

## 8. Deferred

- **Milestone 2 — synthesis layer.** OpenRouter + Gemini BYO key, encrypted at rest (AES-256-GCM
  via node `crypto`, no new dependency), behind a `/settings` route. Requires the `src/proxy.ts`
  matcher fix in §3.6 **before** it ships.
- **Milestone 3 — multi-candidate day generation**, composing from the tray built here.
- **Transit routing is not solved at $0.** Mapbox Directions has no transit profile. v1 answers
  "how do I get around" with Wikivoyage's *Get around* section plus the nearest OSM station.
  True A→B transit routing may not be free at all and deserves its own decision rather than
  being half-shipped.
- Wikipedia enrichment, place photos, drag-and-drop reordering.

## 9. Open questions for the next session

1. **Wikivoyage page-title resolution.** `Trip.destinations` is a free-text `String[]`. "Fukuoka"
   resolves cleanly; "Fukuoka, Japan" or "Hakata" may not. Needs a search/normalise step against
   the MediaWiki search API, and a decision on what to do when a destination has no page.
2. **Overpass query category mapping.** OSM tags (`amenity=restaurant`, `tourism=museum`, …) need
   mapping onto the app's fixed `Activity.category` vocabulary
   (Food | Transport | Lodging | Sightseeing | Other). Not yet designed.
3. **Wikitext rendering.** Wikivoyage sections come back as raw wikitext with templates and
   markup. Decide between stripping to plain text, minimal parsing, or `action=parse`'s HTML
   output — the last is easiest but needs sanitising before rendering.
4. Whether the guide panel belongs on the Places route or on the trip page itself.
