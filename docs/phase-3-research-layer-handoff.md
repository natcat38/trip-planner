# Phase 3 Handoff — Destination Research & Saved-Places Tray

> **Status:** **Milestones 1 (§5) and 2 (§8) are implemented** (2026-08-20) — see ADR-0008,
> ADR-0009 and ADR-0010. M2's live re-verification findings are in §10 and **correct §3.8**.
> M3-M7 (§8) remain planned, not built; each still needs its own planning pass at execution
> time, re-verifying third-party API shapes live rather than from training memory.
> **Written:** 2026-08-19. **Revised same day** after a second research pass (four web-research
> agents) and a decision round with the user: Milestone 1 is **approved as written**, its open
> questions are resolved (§9), and §8 is now a decided M2–M7 roadmap, not a deferral list.
> **Audience:** a fresh session picking this up cold — intended orchestration: Opus as
> orchestrator dispatching Sonnet subagents per task.
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

### 3.8 Transit routing IS free — the earlier "may not be free at all" is falsified

**Transitous** (`https://api.transitous.org/api/`, community-hosted MOTIS v2) is live, keyless,
and was **verified by a live test query**: a route near Tokyo Station → Tokyo Tower area
returned 5 valid multi-leg rail/subway itineraries with correctly named stations (大手町,
御成門, 新橋) and realistic 24–35 min timings. European feed coverage spans all major countries.

Conditions (from transitous.org/api/): best-effort service, **no SLA**, they may cut off any
consumer at any time; must send a `User-Agent` identifying the app + contact email; visible
attribution to `transitous.org/sources/` and OSM required; non-commercial use fine; courtesy
email to maintainers recommended before doing routing volume. Spot-check non-Tokyo coverage
(Kyoto, Osaka, rural areas, smaller EU cities) before trusting app-wide.

**Google Routes/Directions API is ruled out twice over**: (1) the free 10k calls/month now
requires a billing account with a card — real overcharge risk for a $0 project; (2) its ToS
requires results be displayed on a Google-branded map, which conflicts with the app's Mapbox
map. **Google/Apple Maps deep links are the free fallback**: officially documented URL schemes,
no key, no quota — `https://www.google.com/maps/dir/?api=1&origin=…&destination=…&travelmode=transit`
and `https://maps.apple.com/?saddr=…&daddr=…&dirflg=r`.

Ruled out: Navitia (free tier effectively France-only, per-region tokens), hosted
OpenTripPlanner (no pan-Europe/Japan public instance; self-hosting violates $0), ODPT
(data-only, no routing endpoint), NAVITIME/Jorudan/Ekispert (no confirmed self-serve free tier).

### 3.9 Free-AI landscape (Aug 2026) — BYOK is the only $0 model; OpenRouter + Groq are ToS-clean

- **GitHub Models is dead** — fully retired 2026-07-30. Older "best free LLM API" articles
  still list it; ignore them.
- **OpenRouter**: ToS §5.2 explicitly contemplates serving your own end users; no EEA
  restriction; BYOK is a documented first-class feature. `:free` models: 20 req/min, 50
  req/day at $0 balance, 1,000/day after a one-time $10 credit. Account privacy toggles
  ("free endpoints that may train on inputs" / "may publish prompts") must stay **off** —
  surface this in app docs. Never opt into the 1% prompt-logging discount.
- **Groq**: cleanest ToS surveyed — Services Agreement §3.1 explicitly authorizes making it
  available to end users through a "Customer Application"; UK/EEA contracting entity + SCC
  DPA; states it never trains on customer data. Open-weights models only, very fast.
- **Mistral** (EU company, likely EEA-safest) is a conditional third: phone-verification
  friction, unpublished free-tier limits, and the API-vs-consumer terms split needs one manual
  check of its commercial terms before relying on it.
- **No provider's free tier can serve all users from one app-held key** at real scale.
  Cloudflare Workers AI (10k neurons/day, app-held) is the only structural option and only
  demo-sized. Hence BYOK.
- BYOK precedent: no formal legal blessing, but OpenRouter and Groq allow it in their own
  terms, an ecosystem of tools (Warp, ngrok, BYOKList.com) practices it openly, and provider
  prohibitions target key *resale/sharing*, not a user's own key in a tool acting for them.
  Distinct risk to avoid: piggybacking flat-rate chat *subscriptions* (the pattern Anthropic
  enforced against in Apr 2026) — metered API keys are the permitted pattern.
- Whether routing Gemini *through OpenRouter* cures the §3.4 EEA problem is **unresolved** —
  don't rely on it; moot given other free models.

### 3.10 Competitive findings (Wanderlog + peers)

- **Nobody does "multiple options per day" — including Wanderlog.** Its AI generates one
  draft, then editing is manual (the AI cannot even add places to the map from chat
  afterward); Layla and Google Gemini do reactive single-swaps via chat. A structured
  "N candidate days, approve/swap" UI is a **differentiator, not parity**.
- Wanderlog's data = Google Places (ratings/hours/price level) + mention-count aggregation
  across ~21 travel blogs. **Star ratings/reviews are structurally unfree** (Google's paid
  API; OSM has none; Yelp's free tier forbids persisting reviews). Deep-link to the place's
  Google Maps page instead.
- Wanderlog's AI was caught serving stale training-data facts (Hagia Sophia listed as free
  museum; it's a ~€25 mosque since 2020) — vindicates this project's grounding rule (§4).
- Wanderlog free tier also has: checklists/packing lists, place notes, custom pin
  colors/icons, weather, browser extension, place photos. Pro ($39.99/yr) adds: unlimited AI
  messages, route optimization, offline maps, export route to Google Maps, Gmail auto-scan,
  unlimited attachments, flight/car deal alerts, live flight tracking, dark mode.
- **Wanderlog gaps (differentiator opportunities, confirmed):** no calendar/ICS export at any
  tier; no whole-trip duplication/cloning (confirmed via its founders' own forum replies).
- Pro features that are **free to build at personal scale**: offline access (PWA
  service-worker caching of viewed data), unlimited attachments, route optimization
  (travel-time TSP over a day's stops), dark mode.

## 4. Decisions taken with the user

| Decision | Choice | Rationale |
| --- | --- | --- |
| LLM in v1 | **None** | If Wikivoyage *is* the price data and OSM has none, a model sources nothing — it only reformats prose we can render directly. Dropping it removes key storage, encryption, a settings route, quota handling and the entire ToS exposure from this milestone. |
| LLM later (milestone 2) | **OpenRouter and Gemini both** | One function, provider branch on key prefix; both are a single POST with a JSON schema. OpenRouter is the **default** — BYOK is a first-class supported flow there. Gemini requires an explicit EEA/UK/CH disclosure (see §3.4). |
| Grounding rule | **No user-visible fact may be model-generated** | Everything traces to OSM or Wikivoyage, or is `null`. |
| Thin coverage | **Coverage indicator, degrade honestly** | Never render an empty panel that looks broken. Falls back to OSM-places-only, which works globally. |
| "Multiple options per day" | **Saved-places tray first** | Multi-candidate day generation is a later milestone that composes from the tray. |
| Scope | **One vertical slice, end to end** | Prove the free-data stack before building UI on top of it. |

Second decision round (2026-08-19, after the research in §3.8–3.10):

| Decision | Choice | Rationale |
| --- | --- | --- |
| Milestone 1 | **Approved as written**, open questions resolved per §9 | — |
| Transit (M2) | **Transitous primary, Google/Apple deep links fallback, prose + nearest station last resort** | Keyless, verified live in Tokyo (§3.8); slots before the AI layer because it needs no settings route. |
| AI providers (M3) | **BYOK: OpenRouter default + Groq second** | Both ToS-clean for third-party apps and EEA (§3.9). User requirement: key entry/edit must be easy. Gemini-direct stays blocked (§3.4). |
| Day generation (M4) | **Guided questionnaire → 2–3 grounded candidate day plans; algorithmic path when keyless** | User wants day-trip style ("what to do in Shibuya for a day"), focus weights incl. food, iconic sights, and off-the-beaten-path/unique finds. Grounding rule unchanged. |
| QoL pack (M5) | **All eight features** | Checklists, day notes, weather, ICS export, trip clone, pin colors, group voting, dark mode. |
| Attachments storage (M6) | **Postgres `bytea` + per-file cap + per-trip total cap** | No new service. Encryption-at-rest required before allowing identity documents. |
| Browser extension | **Later milestone (M7)**, not dropped | Highest-effort item; most direct hit on "never open another tab". |
| Skipped | Flight/hotel price APIs, live flight tracking, Gmail auto-scan, imported reviews/ratings | All need paid APIs or heavy compliance; deep-link out instead (§8). |

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

M3 (the first milestone with a settings route — see §8) **must** extend the matcher before
that route ships. See §3.6.

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

## 8. Roadmap — decided milestones (M2–M7)

M1 (this document's §5) is the only milestone planned to execution detail. **Each later
milestone needs its own planning pass at execution time** — verify APIs live again (per §3.7's
lesson: don't write third-party API shapes from training memory), then plan, then build.
Sequence and scope below are decided; internals are not.

### M2 — "How do I get there": transit routing

- `src/lib/research/transitous.ts` following the house pattern (server-only, never throws,
  module-level cache, timeout): `planJourney(from, to, when)` against
  `https://api.transitous.org/api/` (MOTIS v2). Send `User-Agent` identifying the app + contact
  email. Best-effort service — every call must degrade gracefully.
- Fallback chain: Transitous → "Open in Google Maps" / "Open in Apple Maps" deep-link buttons
  (also shown as permanent secondary actions next to any result) → Wikivoyage *Get around*
  prose + nearest OSM station (already built in M1).
- Visible attribution: `transitous.org/sources/` + OSM.
- Before shipping: spot-check coverage on non-Tokyo routes (Kyoto, Osaka, a rural JP town, 2–3
  EU cities); send the courtesy email to Transitous maintainers.
- Keyless → no settings route, no proxy change. ADR: "Transitous for transit routing; Google
  Routes API rejected (billing-card requirement + Google-map display ToS vs. Mapbox)".

### M3 — BYOK AI layer

- **Prerequisite, do first:** extend the `src/proxy.ts` matcher before any `/settings` route
  exists (§3.6), plus in-action `currentUserId()` guard as defence in depth.
- Providers: **OpenRouter default, Groq second** — one function, provider branch on key prefix.
  Keys encrypted at rest (AES-256-GCM via node `crypto`, no new dependency). Handle 429s;
  never hardcode rate limits (§3.7).
- **User requirement: key setup must be easy** — paste/edit/remove key in `/settings` with a
  "test key" button and plain-language pointers to where each provider issues keys. App docs
  must tell OpenRouter users to keep the train-on-inputs/publish-prompts toggles off (§3.9).
- Grounding rule holds: the model reformats/summarizes retrieved OSM/Wikivoyage content; no
  user-visible fact may be model-generated (ADR from §7).

### M4 — Guided multi-option day generation (the differentiator — see §3.10)

- Input is a short **questionnaire, not a blank chat**: area ("Shibuya", "day trip from
  Fukuoka"), focus weights (food / iconic sights / off-the-beaten-path & unique finds /
  shopping / nature), pace (packed vs. relaxed), budget level.
- Output: **2–3 candidate day plans**, each a sequenced list of real places drawn from the
  saved tray + OSM search + Wikivoyage guide. Accept a candidate wholesale into the itinerary,
  or swap individual slots from other candidates/the tray.
- With a BYOK key: the LLM does selection, sequencing, and "why this is unique" blurbs —
  grounded in retrieved data only. "Off the beaten path" = prompt it to favor places absent
  from the guide's headline *See* items.
- Without a key: algorithmic candidates — proximity clustering + travel-time ordering (the
  same math as Wanderlog's *paywalled* route optimization). Both paths ship; keyless users
  are not locked out.

### M5 — Quality-of-life pack (all free-to-build; can be split into small PRs)

Checklists/packing lists · notes per day (per-place notes exist from M1's `Place.notes`) ·
weather via **Open-Meteo** (keyless, forecast + historical, house fetch pattern) · **ICS
export** (RFC 5545, ~dozens of lines — Wanderlog lacks this entirely) · **trip
duplication/clone** incl. clone-from-`/shared/[token]` (Wanderlog lacks this too; cloning must
copy only what the sharing boundary already exposes) · custom pin colors/icons (extend
`Map.tsx` pin props) · group voting/reactions on activities · dark mode (Tailwind toggle).

### M6 — Offline PWA + attachments

- Offline: service worker + IndexedDB caching of already-viewed itinerary, notes, and map
  tiles. "What you've looked at stays available" — not region downloads.
- Attachments: **Postgres `bytea`** with a per-file size cap **and a per-trip total cap**
  (user decision). No identity documents until encryption-at-rest is added.

### M7 — Browser extension

MV3 extension: save a place to a trip from any webpage via the app's own API; geocode via
Nominatim (fits existing OSM usage). Highest-effort item; most direct hit on the "never open
another tab" goal.

### Explicitly skipped (deep-link out instead)

- Hotel/flight price comparison → pre-filled Google Flights/Kayak links. Real integration
  needs paid affiliate/GDS APIs.
- Live flight tracking → link to FlightAware/Google flight status.
- Gmail auto-scan → Google OAuth sensitive-scope compliance isn't worth it; manual
  forward-and-parse can ride on M3's LLM later.
- Imported reviews/ratings → structurally unfree (§3.10); deep-link to the place's Google
  Maps page.
- Still unscheduled: Wikipedia enrichment, place photos (Wikimedia Commons is the $0 source
  when wanted), drag-and-drop reordering.

## 9. Formerly-open questions — RESOLVED (user-approved defaults, 2026-08-19)

1. **Wikivoyage page-title resolution:** one MediaWiki search call
   (`action=query&list=search`) on the free-text destination, take the top hit; no hit →
   `coverage: 'none'` and the existing honest-degrade path. No new UI.
2. **Overpass → category mapping:** small static lookup table (~15 lines):
   `amenity=restaurant|cafe|fast_food|bar → Food`,
   `tourism=museum|attraction|viewpoint|gallery → Sightseeing`,
   `railway=station` / `highway=bus_stop → Transport`,
   `tourism=hotel|hostel|guest_house → Lodging`, everything else → Other.
3. **Wikitext rendering:** strip to plain text (drop templates, unwrap links). `action=parse`
   HTML would need a sanitizer (new dependency or XSS risk); the payload is prose with prices,
   which survives plain text fine. Revisit only if it reads badly.
4. **Guide panel location:** the Places route, as §5.8 already says.


---

## 10. M2 live re-verification (2026-08-20) — corrections to §3.8

§3.8 was written from a research pass. Re-verifying against the live API before building found
things it got wrong or missed. Recorded here for the same reason §3 exists.

### 10.1 §3.8's conditions list was incomplete — the licence condition

The Transitous usage policy requires, of any consuming application:

> Make sure your source code is published under an appropriate open-source license

§3.8 did not mention this at all. At the time of the M2 build the repo was **public but
unlicensed** — legally all rights reserved, which does *not* satisfy the condition. The repo is
now **MIT licensed** (`LICENSE` + `package.json`), and that is a prerequisite of using the API,
not incidental housekeeping.

Two further corrections: contact is via their **Matrix channel**, not email; and the policy asks
consumers to make contact **before** using resource-intensive endpoints (it names routing as
difficult to calculate), rather than the "courtesy email recommended" §3.8 described. The
`User-Agent` must carry application name, **version**, and contact — the M1 modules were sending
no version, and have been corrected.

**Decision taken (see ADR-0010):** that message was deliberately **not** sent; the client
self-throttles in code instead. This is a knowing deviation from their stated policy, accepted by
the project owner, not an oversight.

### 10.2 Coverage is per-operator, not per-city — the biggest finding

§3.8 said to "spot-check non-Tokyo coverage". Doing so showed the framing itself was wrong:
coverage does not decompose by city.

| Route | Result |
| --- | --- |
| Tokyo Sta → Tokyo Tower | 10 itineraries (大手町 → 御成門) |
| Osaka, Fukuoka, Lisbon, Paris, Berlin, Rome | 3–6 itineraries, real multi-modal legs |
| Kyoto Sta → **Gion** | 5 itineraries |
| Kyoto Sta → **Kinkaku-ji** | **0, at every time of day** |
| Yubari (rural JP) | 0 |

Kinkaku-ji is bus-served and Kyoto City Bus is not in the feed. So a city can look well covered
via rail while its best-known sights are unreachable. **Consequence:** the fallback must trigger
on zero results *for this route*, never on a "is this city supported" check, and the UI must say
"no route found in this data" rather than implying no transport exists.

### 10.3 Responses are ~1.8 MB and no parameter trims them

A Paris route returns ~1.8 MB. Composition per leg: `alerts` 691 KB, `from` 421 KB, `tripFrom`
199 KB, `intermediateStops` 181 KB, `steps` 116 KB. `detailedTransfers=false` and
`numItineraries` barely move it. Geometry, the intuitive suspect, is only 7 KB.
**Consequence:** project to a compact summary immediately and discard the rest. Anyone tempted to
surface service alerts should measure first.

### 10.4 `routeShortName` is often an internal ID, not a line name

Japanese rail feeds put a numeric internal id there with an empty `routeLongName` — a leg came
back as `routeShortName: "8478511"`, `agencyName: "都営地下鉄"`, `headsign: "日吉(神奈川県)"`.
Rendering `routeShortName` directly would tell a traveller to board "line 8478511". Short numeric
route numbers are legitimate elsewhere (Lisbon bus `728`), so the client resolves
`routeLongName` → `routeShortName` (unless it looks like an internal id) → `agencyName`, and also
projects `headsign` and `agency`, which are the genuinely useful fields.

### 10.5 What shipped

`transitous.ts` (five restraint layers per ADR-0010), `mapLinks.ts` (permanent Google/Apple
deep links), `src/server/transit.ts` (takes **activity ids, not coordinates**, so the shared
budget can't be used as a general routing proxy), and a `TransitLeg` disclosure between
consecutive activities that fetches only on click.

**Not built, deliberately:** the nearest-OSM-station rung of §8's fallback chain. `nearestStation`
has existed unused since M1; the Wikivoyage *Get around* prose and the map deep links already
cover the degraded path, so wiring a third rung was not justified. It remains available.
