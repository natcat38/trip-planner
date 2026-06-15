---
type: Integration
title: Mapbox
description: Geocoding of activity places and a map view of pins, with the token kept off the browser.
resource: https://docs.mapbox.com/
tags: [integration, maps]
timestamp: 2026-06-15T00:00:00Z
---

# Schema

- **Geocoding** — when an [activity](/domain/itinerary.md) place is set, geocode the name to
  lat/lng and store it. ⚠️ Proxy the call through a Route Handler so the token isn't exposed,
  or use a URL-restricted public token.
- **Map view** — a Mapbox GL map showing activity pins for the selected day/trip, with two-way
  highlight against the itinerary list.

Maps are the designated trim point: if the ship date tightens, this integration defers to Phase 2.

# Citations

[Tech Scope Task 7](../../docs/Trip_Planner_Tech_Scope.md).
