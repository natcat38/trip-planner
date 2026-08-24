# ADR-0010: Transitous for transit routing; self-throttled in lieu of prior contact

**Status:** Accepted (2026-08-20)

## Context
Phase 3's third product question is "how do I get there, and what transport exists". Milestone 1
answered it only partially, via Wikivoyage's *Get around* prose and the nearest OSM station.

Options were re-verified live against the real APIs before this decision, per the lesson recorded
in `knowledge/integrations/transit-routing.md` (handoff retired 2026-08-24):

- **Transitous** (`https://api.transitous.org/api/`, community-hosted MOTIS 2) is live and keyless.
  `GET /api/v1/plan` returned 10 valid itineraries for Tokyo Station → Tokyo Tower via 大手町 and
  御成門. Osaka, Fukuoka, Lisbon, Paris, Berlin and Rome all returned real multi-modal results.
- **Google Routes/Directions API is ruled out twice over:** its free tier now requires a billing
  account with a card (real overcharge risk against ADR-0001's $0/month constraint), and its terms
  require results be displayed on a Google-branded map, which conflicts with this app's Mapbox map.
- **Google/Apple Maps deep links** are officially documented URL schemes needing no key, no quota
  and no agreement.
- Ruled out earlier and unchanged: Navitia (effectively France-only free tier), hosted
  OpenTripPlanner (no pan-Europe/Japan public instance; self-hosting breaks $0), ODPT (data only,
  no routing), NAVITIME/Jorudan/Ekispert (no confirmed self-serve free tier).

Three findings from the live pass materially shaped this decision:

1. **Coverage is per-operator, not per-city.** Kyoto Station → Gion returns 5 itineraries, but
   Kyoto Station → Kinkaku-ji returns **zero at every time of day**, because Kinkaku-ji is
   bus-served and Kyoto City Bus is not in the feed. A city can look covered via rail while its
   best-known sights are unreachable. Yubari (rural) returns zero outright.
2. **Responses are very large.** A Paris route is ~1.8 MB, of which ~691 KB is service `alerts`,
   plus `intermediateStops`, `steps` and repeated stop metadata. No query parameter trims this.
3. **Their usage policy requires the consuming application's source to be published under an
   open-source license** — a condition the Phase 3 research pass had missed. It also requires a
   `User-Agent` carrying application name, **version** and contact, and visible attribution to
   `transitous.org/sources/` and OpenStreetMap.

## Decision
1. **Transitous is the transit routing source**, wrapped in `src/lib/research/transitous.ts`
   following the house third-party pattern (server-only, never throws, module-level cache).
2. **The repository is MIT licensed** (`LICENSE`, plus `package.json`), which is what makes use of
   the API legitimate. This is a prerequisite of the feature, not incidental housekeeping.
3. **Zero results is a first-class outcome, not an error.** `planJourney` returns `[]` for "no
   route exists" and `null` for "we did not or could not ask". The UI renders those differently:
   the first is an honest "no transit route found", the second silently falls back.
4. **Map deep links are permanent, always-visible secondary actions**, not an error state. Given
   finding 1, they are frequently the only answer available.
5. **We self-throttle instead of contacting the maintainers first.** Their policy asks consumers to
   make contact via Matrix before using resource-intensive endpoints, and explicitly names routing
   as difficult to calculate. That message has deliberately not been sent. In its place the client
   enforces, in code:
   - requests only on explicit user action, never on page render;
   - a cache keyed on coordinates rounded to ~11 m and departure times bucketed to 15 minutes, so
     repeat views of the same leg cost nothing;
   - a hard token-bucket cutoff (10 requests/minute per instance) that returns `null` rather than
     queueing or retrying;
   - a circuit breaker that stops calling for 60s after 3 consecutive failures;
   - a 15s timeout, no retries, and no mirror.

## Consequences
- **This is a knowing deviation from a request in their usage policy**, accepted by the project
  owner. The throttling reduces load but does not substitute for the heads-up they asked for. If
  this app's usage ever grows beyond personal scale, making that contact stops being optional —
  and self-hosting a MOTIS instance is the documented escape hatch.
- Attribution to `transitous.org/sources/` and OpenStreetMap is mandatory wherever results appear.
- The rate limiter and circuit breaker are **per serverless instance**, not global; several warm
  instances could each spend their own budget. Real global limiting needs shared state, which
  needs paid infrastructure, which ADR-0001 forbids. The cache is the main lever, and the limiter
  is a backstop against a single runaway session.
- Because responses are ~1.8 MB, the client projects each itinerary down to a compact summary
  immediately and discards `alerts`, `intermediateStops` and `steps`. Anyone tempted to surface
  service alerts should measure the payload cost first.
- Users planning around bus-only destinations will routinely see no itineraries. That is a data
  gap in the upstream feeds, not a bug to fix in this app, and the UI must say so plainly rather
  than implying no transport exists.
