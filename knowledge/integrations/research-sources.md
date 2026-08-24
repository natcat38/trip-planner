---
type: Integration
title: Research sources
description: The two keyless data sources behind destination research — Overpass/OpenStreetMap for places and Wikivoyage for guide prose and sample prices.
resource: ../../docs/adr/0008-grounded-research-no-generative-layer.md
tags: [integration, research, osm, wikivoyage]
timestamp: 2026-08-20T00:00:00Z
---

# Schema

Both sources are keyless, both were verified live, and both follow the house third-party pattern
(server-only, never throws, module-level cache) already used by
[Mapbox](/integrations/mapbox.md) and the FX rates.

- **Overpass / OpenStreetMap** (`src/lib/research/overpass.ts`) — name, coordinates, `cuisine`,
  `opening_hours`, `website`, `phone` for [places](/domain/places.md), plus a nearest-station
  lookup. ⚠️ **OSM carries no price data whatsoever** — verified against a live Fukuoka sample,
  zero of 83 restaurants had any cost tag. Never present it as a pricing or ticketing source.
  Requires a mirror fallback and an explicit timeout: the primary host 504s under load.
- **Wikivoyage** (`src/lib/research/wikivoyage.ts`) — the *Eat*, *See*, *Do*, *Get around* and
  *Get in* sections of a destination's guide, fetched as wikitext and stripped to plain text.
  This is where prices actually live, inside listing templates' `price=` fields — a stripper that
  drops templates wholesale silently deletes the entire point of the feature.

Guide quality is reported as `coverage: 'good' | 'thin' | 'none'` and the UI **degrades honestly**
rather than rendering an empty panel: thin coverage falls back to OSM places, which work globally.

Prices are **sample prices quoted from prose**, never a computed average — no free source supports
that claim. Attribution is mandatory: OSM is ODbL, Wikivoyage is CC BY-SA.

# Citations

[ADR-0008](../../docs/adr/0008-grounded-research-no-generative-layer.md).
