# ADR-0008: Destination research is grounded in OSM + Wikivoyage, with no generative layer in v1

**Status:** Accepted (2026-08-20)

## Context
Phase 3 asks the app to answer three questions about a place without opening another tab:
where to eat and what a meal costs, whether an attraction needs tickets and what admission is,
and how to get there. The obvious shape is "point an LLM at it", and the first draft of the
plan assumed a free-tier model would supply the facts. Live verification (handoff retired
2026-08-24; see `knowledge/integrations/research-sources.md`) falsified the assumptions underneath
that:

- **OpenStreetMap has no price data at all.** Across a live Fukuoka sample, *zero* of 83
  restaurants carried any price/cost tag, and the `fee` tag appeared on 3 of 106 attractions —
  binary `yes`/`no`, never an amount. OSM's actual admission-cost key, `charge`, did not appear
  once. Overpass is a name/location/cuisine/hours lookup and nothing more.
- **Wikivoyage is the real source.** Hand-written CC BY-SA guide prose genuinely contains the
  answers: a Fukuoka subway day pass at ¥640, Fukuoka Tower at ¥1000, Lisbon's Santa Justa Lift
  at €5. But coverage craters for small places — Yubari, Hokkaido has an empty *Get around*
  section and one priced item on the entire page.
- **"Average meal cost" is not obtainable from anything free.** Wikivoyage gives *sample* prices
  in prose; nothing in the free stack supports a computed average.

Given that, a model in v1 would source nothing. It would only reformat prose the app can render
directly — while adding key storage, encryption, a settings route, quota handling and the whole
third-party ToS surface (see ADR-0009).

## Decision
1. v1 has **no LLM**. The two data sources are Overpass (places) and Wikivoyage (guide prose),
   both keyless and both verified live.
2. **No user-visible fact may be model-generated**, now or later. Every fact traces to OSM or
   Wikivoyage, or is `null`. When a model layer arrives (roadmap M3), its job is to
   reformat/summarize retrieved content, never to supply facts.
3. **Never present a computed "average" price.** Show sample prices with attribution.
4. **Degrade honestly.** A `coverage: 'good' | 'thin' | 'none'` indicator, derived from
   retrieved section sizes, drives an explicit "limited guide data" message and a fallback to
   OSM places only — which works globally. An empty panel that merely looks broken is not
   acceptable.
5. Guides are **not** persisted in Postgres. Content changes slowly and MediaWiki is built for
   volume, so a 24h in-memory cache is the whole story — this removes a model, a migration and
   a staleness problem.

## Consequences
- Attribution is mandatory: OSM is ODbL, Wikivoyage is CC BY-SA. Both are credited in the UI.
- The feature is strong for major cities and thin for small towns, by construction. That is
  surfaced to the user rather than hidden.
- Overpass needs a mirror fallback (`overpass.kumi.systems`) and an explicit timeout — the
  primary host returned 504 twice under moderate load during verification.
- Star ratings and reviews are out of scope permanently at $0: Google's are paid-API-only, OSM
  has none, and Yelp's free tier forbids persisting them. Deep-link to the place's map page
  instead.
- A future contributor proposing "just have the AI fill in the prices" is re-proposing something
  already tested and rejected — the grounding rule is the point, not a placeholder.
