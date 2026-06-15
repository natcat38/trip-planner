---
type: Domain Entity
title: Itinerary
description: The days and ordered activities under a trip, each activity optionally carrying a place and a cost.
resource: ../../docs/Trip_Planner_Tech_Scope.md
tags: [domain, prisma]
timestamp: 2026-06-15T00:00:00Z
---

# Schema

A [trip](/domain/trip.md) generates a `Day` per date in its range. Each `Day` holds ordered
`Activity` rows:

- `title`, optional `placeName`/`lat`/`lng` (geocoded via [Mapbox](/integrations/mapbox.md)),
  `startTime`/`endTime`, `category` (`Food | Transport | Lodging | Sightseeing | Other`), `notes`.
- Optional `costMinor` + `costCurrency` (ISO 4217 of the original cost) — feeds the
  [budget](/domain/budget.md) roll-up.
- `sortOrder` for reordering within a day.

All activity mutations go through the trip-ownership check in [auth](/integrations/auth.md).

# Citations

[Tech Scope §2.1 and Task 5](../../docs/Trip_Planner_Tech_Scope.md).
