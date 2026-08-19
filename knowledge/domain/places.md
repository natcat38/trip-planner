---
type: Domain Entity
title: Places
description: The saved-places research tray under a trip — candidate places gathered from OpenStreetMap before any of them reach the itinerary.
resource: ../../docs/phase-3-research-layer-handoff.md
tags: [domain, prisma, research]
timestamp: 2026-08-20T00:00:00Z
---

# Schema

A [trip](/domain/trip.md) holds `Place` rows: a **research tray**, not itinerary. A place is a
candidate the user is still considering; an [activity](/domain/itinerary.md) is a commitment on
a specific day.

- `source` (`"osm" | "manual"`) + optional `sourceId` (e.g. `node/1234567`), unique per trip via
  `@@unique([tripId, source, sourceId])` so re-saving the same OSM result updates rather than
  duplicates.
- `name`, `lat`, `lng`, `category` (the same vocabulary as `Activity.category`), plus the tags
  OSM actually carries: `cuisine`, `openingHours`, `website`, `phone`.
- `notes` — the user's own research notes.
- Optional `costMinor` + `costCurrency` — **user-entered**, a price they read in a guide. No free
  source supplies this programmatically (see [research sources](/integrations/research-sources.md)),
  and it is minor units + ISO 4217 like every other money field, feeding the
  [budget](/domain/budget.md) roll-up once promoted.

Promoting a place creates an `Activity` and sets `Activity.placeId` (`onDelete: SetNull`), passing
the place's known coordinates through so no geocode fires against the name.

All place mutations go through the trip-access check in [auth](/integrations/auth.md), never by
place id alone. The tray is **deliberately excluded** from [sharing](/domain/sharing.md)'s public
payload — it is a private workspace, not published output.

# Citations

[Phase 3 handoff §5.3, §5.5, §5.6](../../docs/phase-3-research-layer-handoff.md),
[ADR-0008](../../docs/adr/0008-grounded-research-no-generative-layer.md).
