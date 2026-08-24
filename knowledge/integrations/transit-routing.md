---
type: Integration
title: Transit routing
description: Keyless door-to-door transit journeys via Transitous (MOTIS 2), with map deep links as the permanent fallback.
resource: https://transitous.org/api/
tags: [integration, research, transit, transitous]
timestamp: 2026-08-20T00:00:00Z
---

# Schema

Answers the third research question — "how do I get there" — for a pair of
[activities](/domain/itinerary.md) on a day.

- **Transitous** (`src/lib/research/transitous.ts`) — community-hosted MOTIS 2 at
  `https://api.transitous.org/api/v1/plan`. Keyless. House pattern: server-only, never throws,
  module-level cache.
- **Map deep links** (`src/lib/research/mapLinks.ts`) — Google and Apple Maps transit URLs. No key,
  no quota. **Permanent secondary actions, always visible**, not just an error state.

Three outcomes, rendered differently and never collapsed into one:

| Result | Meaning |
| --- | --- |
| `Journey[]` | Real itineraries. |
| `[]` | Transitous confirmed **no route in the data**. Common — coverage is per-operator. |
| `null` | We did not or could not ask (our rate limit, circuit breaker, network, timeout). |

⚠️ **Coverage is per-operator, not per-city.** Kyoto Station → Gion returns 5 itineraries; Kyoto
Station → Kinkaku-ji returns **zero at every time of day**, because Kinkaku-ji is bus-served and
Kyoto City Bus is not in the feed. Never tell a user that no transport exists — only that no route
was found in this data.

Routing is requested **only on explicit user action**, never on render, and the server entry point
takes **activity ids, not coordinates**, so the shared budget can't be used as a general routing
proxy. Transitous is a volunteer, best-effort service: the client self-throttles (lossy cache key,
10 req/min cutoff, circuit breaker, 15s timeout, no retries) per [ADR-0010](../../docs/adr/0010-transitous-for-transit-routing.md).

Attribution to `transitous.org/sources/` and OpenStreetMap is **required** wherever results appear,
and the API's usage policy requires this repository stay open-source licensed (MIT).

# Citations

[ADR-0010](../../docs/adr/0010-transitous-for-transit-routing.md).
