# Phase 3 — open items, deferred decisions, and things that need research

> **Status:** written 2026-08-20, after Milestone 6 (PR #36). Phase 3 M1–M6 are built; **M7 (the
> browser extension) is the only roadmap milestone not started**.
> **Audience:** a fresh session picking this up cold.
> **Read first:** `CLAUDE.md`, `docs/phase-3-research-layer-handoff.md` (especially §3, §10, §11),
> `docs/adr/`.

This collects everything noticed-but-not-built across Phase 3, in one place, so none of it has to be
rediscovered by accident. It is deliberately **not** a backlog to work through top to bottom — most
of these were correct calls at the time and should stay closed. What each entry is for is telling you
**what was decided, why, and what would have to change for the answer to be different.**

Nothing here is a bug in shipped code. Real bugs were fixed before merge; the milestone-by-milestone
record of what live re-verification caught is in the handoff doc's §10 and §11.

---

## 1. Blocked on the project owner — nothing in code can resolve these

| Item | Impact if left | What to do |
| --- | --- | --- |
| **`ENCRYPTION_KEY` is not set in Vercel** | `/settings` renders in production but **saving an AI provider key throws**. M3 and M4's AI features are effectively dead in prod. | Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Must differ from the local `.env` value. Rotating it later invalidates every stored user key — there is no re-encrypt path. |
| **Two OAuth client secrets need rotating** | They were pasted into a chat transcript on 2026-08-20. | The GitHub one is localhost-only (trivial). The **Google one is live in Vercel**: add the new secret and update Vercel **before** deleting the old, or production sign-in breaks in between. |

---

## 2. Gaps in shipped features — they work, within limits worth knowing

### 2.1 No sign-out control exists anywhere in the app
Noticed during M6 while looking for somewhere to hang offline-cache cleanup. There is no UI to end a
session — `signOut` is exported from `src/auth.ts` and never called.

The offline worker compensates by clearing its caches when a navigation to a guarded route comes back
redirected (ADR-0015 §5), which covers session expiry and will keep working once a control exists.
**But adding one should call `caches.delete` directly**, because the redirect only fires on the *next*
navigation.

This is probably the smallest-effort, highest-value item in this document.

### 2.2 The app has never stored a destination timezone
`Day.date` is UTC midnight and `Activity.startTime` is a bare `"09:30"`. Consequences already
absorbed:

- **ICS export emits floating local time** — no `Z`, no `TZID` (`src/lib/ics.ts`). That is the correct
  reading for a traveller at the destination, but it means a calendar app on a laptop at home shows
  the wrong wall-clock time.
- Anything else time-sensitive inherits the same limitation.

**Upgrade path, if wanted:** Open-Meteo (already a dependency for weather,
`src/lib/research/weather.ts`) returns an IANA timezone for a lat/lng. Attaching it to `Trip` or `Day`
would let ICS emit a real `TZID`. Not free — it needs a migration and a decision about trips spanning
multiple zones.

### 2.3 Weather beyond 16 days is last year's weather
`forecast_days=17` is a hard 400 from Open-Meteo, so **"no forecast" is the common case for planning**,
not the edge case. Beyond the window the UI shows the same calendar dates one year earlier from the
archive API, labelled "Last year on this date:" in the sentence itself, per the degrade-honestly rule
(ADR-0008, ADR-0013). Working as designed; noted because it surprises people.

### 2.4 Offline is read-only, and in-app link navigation isn't guaranteed
Next fetches RSC payloads for client-side `<Link>` navigation, and those are deliberately not cached
(ADR-0015). A **full page load** of a visited URL always works offline; clicking a link might not.

Caching RSC responses is the follow-up if it turns out to matter. It needs care: those responses
`Vary` on the router state tree, so naive caching produces misses at best and cross-route mixups at
worst. **Measure whether users actually hit this before building it.**

### 2.5 Transit routing has real coverage holes, per-operator not per-city
The single most important M2 finding (handoff §10.2): Kyoto Sta → Gion returns 5 itineraries; Kyoto
Sta → **Kinkaku-ji returns 0 at every time of day**, because it is bus-served and Kyoto City Bus is
not in the feed. **A city can look well covered via rail while its best-known sights are unreachable.**

The UI says "no route found in this data" rather than implying no transport exists. That is the
correct handling and should not be "fixed".

### 2.6 `nearestStation` ships unused
`src/lib/research/overpass.ts` has exported `nearestStation` since M1. M2's fallback chain
deliberately stopped at two rungs — Wikivoyage's *Get around* prose plus map deep links already cover
the degraded path, so a third was not justified (handoff §8 close-out). It remains available if the
gap in 2.5 ever needs a better answer.

---

## 3. Deferred with the decision already recorded — don't re-litigate without a reason

### 3.1 Attachments are not encrypted at rest
`src/lib/crypto.ts` exists (AES-256-GCM, built in M3 for provider API keys) and could be pointed at
the `Attachment.data` column tomorrow. It wasn't, because encrypting it needs a **key-rotation story
for data that is useless once lost** — a decision worth its own milestone, not a footnote in M6
(ADR-0016 §4).

Until that exists the UI says plainly that passports and ID don't belong there. **If you build the
encryption, that copy is what unblocks storing identity documents** — the user decision recorded in
the handoff doc's §4 gates one on the other explicitly.

### 3.2 Attachment storage will hit a wall, and the escape hatch is chosen
Neon's free plan allows **0.5 GB for the entire database** — trips, days, activities, expenses and
attachment bytes together. The caps (4 MB/file, 20 MB/trip) are sized against that, not against what
a file picker makes easy to select.

If it ever binds, **Vercel Blob is the pre-selected escape hatch**: free on Hobby, keeps files off
Neon. It was rejected for now because it is a new service needing its own auth for private delivery,
and exceeding the Hobby allowance **locks Blob out for 30 days**. `src/server/attachments.ts` is the
single place that would change (ADR-0016 §1).

Nobody is currently monitoring headroom. A `SELECT pg_database_size(...)` check would be cheap.

### 3.3 Map tiles cannot be cached offline — this is a licence limit, not a technical one
Mapbox sets a **12-hour device TTL** on vector tiles, GL JS has no supported offline mode (that
feature exists only in the Mobile SDKs), and neither the ToS nor the Product Terms grant retention
beyond it. Verified against their live documentation during M6.

`public/sw.js` caches **same-origin requests only**, so this holds structurally rather than by a
hostname rule anyone could forget. `src/lib/offline.test.ts` asserts a Mapbox URL is refused.

**The only route to offline maps is moving `src/components/Map.tsx` to a raster basemap whose licence
permits caching** (ADR-0015 §1). That is a map-layer rewrite and a visual downgrade — well beyond a
tweak, and it would also drop the Mapbox token from the stack.

### 3.4 The Transitous contact message was deliberately not sent
Their usage policy asks consumers to make contact **before** using resource-intensive routing
endpoints. The project owner decided not to, and to enforce restraint in code instead — five layers in
`src/lib/research/transitous.ts` (user-action-only, coordinate/time-bucketed cache, 10 req/min cutoff,
circuit breaker, 15s timeout with no retries).

**This is a knowing deviation, accepted by the owner, not an oversight** (ADR-0010). If usage ever
grows past personal scale, making that contact **stops being optional**; self-hosting a MOTIS instance
is the documented escape hatch.

Related and already satisfied: their policy also requires consuming apps to publish their source under
an open-source licence. The repo is MIT licensed *because of that clause* — it is a prerequisite of
using the API, not housekeeping.

### 3.5 The rate limiter is per serverless instance, not global
Several warm instances could each spend their own budget. Real global limiting needs shared state,
which needs paid infrastructure, which ADR-0001 forbids. **The cache is the main lever; the limiter is
a backstop against a single runaway session** (ADR-0010).

### 3.6 Several caches are size-capped Maps, not LRUs
`geocode.ts`, `transitous.ts`, `weather.ts` all carry a `ponytail:` comment saying so. Deliberate —
an LRU is more code for a workload nobody has measured. Upgrade if eviction ever shows up in practice.

### 3.7 Trip duplication is one create per row inside a 20s transaction
`src/server/trips.ts` raises Prisma's 5s default rather than removing the ceiling. A two-week trip is
easily 100+ sequential round trips, quick against local Postgres and much slower against Neon over the
network. **Upgrade path is recorded in the code**: batch with `createMany` and pre-generated ids.

---

## 4. Genuinely unresolved — needs research or an outside answer

### 4.1 Groq's "not for consumer use" clause
Groq's Services Agreement opens with *"Cloud Services and the AI Model Services under this Agreement
are not for consumer use."* No authoritative source resolves what this restricts. It may be B2B
contract posture disclaiming consumer-protection treatment, or it may be read as excluding personal
use by an individual. Under BYOK each end user is themselves the "Customer", so the ambiguity lands on
them.

**Recorded in ADR-0011 as an unresolved risk, not a cleared one** — it is the closest analog to the
Gemini clause an earlier research pass missed entirely (ADR-0009). If it is ever clarified against
personal use, Groq's position as the default provider has to be revisited.

### 4.2 Groq's own docs contradict themselves on live model ids
The embedded API schema lists models the same page's marketing content calls deprecated. Unresolvable
without a live key; the app handles it by listing models from the API at runtime rather than hardcoding.

### 4.3 OpenRouter's free tier costs privacy, which is why it is not the default
OpenRouter's free endpoints *generally require* permission to train on and publish prompts — the same
objection that disqualified Gemini. This reversed the roadmap's original OpenRouter-first ordering.
Also: **OpenRouter ToS §7 prohibits reselling API access**, which is fine for strict per-user BYOK but
fatal for any app-held shared key. Worth re-reading their terms before anyone proposes a hosted key.

### 4.4 Transitous responses are ~1.8 MB with no trimming parameter
691 KB of that is service alerts. The client projects each itinerary to a compact summary immediately
and discards `alerts`, `intermediateStops` and `steps`. **Anyone tempted to surface service alerts
should measure the payload cost first** (ADR-0010).

---

## 5. Not built at all

### 5.1 M7 — the browser extension (the one remaining roadmap milestone)
MV3 extension: save a place to a trip from any webpage via the app's own API, geocoding via Nominatim
(fits the existing OSM usage). Highest-effort item on the roadmap and the most direct hit on the
"never open another tab" goal.

**Not yet planned in any detail.** It needs its own planning pass with live re-verification first —
see §7 below. Open questions a plan would have to answer: how the extension authenticates against a
database-session app, whether it needs a new API surface or can reuse Server Actions (it can't —
those are same-origin POSTs), and Nominatim's usage policy, which is stricter than Overpass's.

### 5.2 Explicitly skipped, with the reasoning recorded
From the handoff doc §8. These were researched and ruled out — **read §3 of that doc before
re-proposing any of them**:

| Skipped | Why | Instead |
| --- | --- | --- |
| Hotel/flight price comparison | Needs paid affiliate/GDS APIs | Pre-filled Google Flights/Kayak links |
| Live flight tracking | Same | Link to FlightAware / Google flight status |
| Gmail auto-scan | Google OAuth sensitive-scope compliance isn't worth it | Manual forward-and-parse could ride on M3's LLM later |
| Imported reviews/ratings | Structurally unfree (handoff §3.10) | Deep-link to the place's Google Maps page |

### 5.3 Unscheduled, never decided either way
- **Wikipedia enrichment** for saved places.
- **Place photos** — Wikimedia Commons is the $0 source when wanted.
- **Drag-and-drop reordering** of activities (today: up/down buttons).

---

## 6. Small, cheap, and probably worth doing

- **A sign-out control** (§2.1). Smallest effort, clearest gap.
- **Extract the e2e sign-in helper.** Five specs now hand-roll the same "create a Session row, set
  `authjs.session-token`" preamble: `export`, `places`, `settings`, `transit`, `attachments`. Pull it
  into `e2e/auth.ts`. Noted during M6's review; skipped there to keep the diff on-topic.
- **A database-size check** against Neon's 0.5 GB (§3.2), so the wall is seen coming.
- **Bump `CACHE_NAME` in `public/sw.js`** after any change to the root layout, or users keep old
  shells until the worker updates for another reason.

---

## 7. The one process rule that has paid off every single time

**Every milestone needs its own planning pass that re-verifies third-party behaviour against the live
API before anything is built.** That discipline has caught a real, plan-invalidating fact in *every*
milestone so far:

| Milestone | What the plan assumed | What was actually true |
| --- | --- | --- |
| M1 | OSM carries prices | It doesn't. Prices live inside Wikivoyage `{{see\|price=}}` templates |
| M2 | Transit coverage is per-city | It's per-operator — Kyoto's buses aren't in the feed at all |
| M3 | OpenRouter's free tier is the clean default | Its free endpoints generally require training-on-prompts |
| M4 | A small token cap is enough | Reasoning models spend the whole budget thinking and return nothing |
| M5 | Weather forecasts cover a trip | They stop at 16 days, so "no forecast" is the common case |
| M6 | Map tiles can be cached offline | 12-hour TTL, no offline mode, no retention right |

In all six the mocked test suites were green. **The tests never caught any of them.**

M6 added a corollary worth keeping: **when a control has no visible symptom when it's broken, measure
what the API actually returns rather than trusting the reading that looks obvious.** The offline
worker's session-end cache clearing tested `response.redirected` and `response.url`; navigation
requests carry redirect mode `manual`, so `fetch()` returns
`{type: 'opaqueredirect', status: 0, ok: false, redirected: false, url: '<the requested page>'}` —
`redirected` is false and the destination absent. The check could never fire, and nothing anywhere
would have shown it. Instrumenting the worker and reading the real response settled it in minutes.
