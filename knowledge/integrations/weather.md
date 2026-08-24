---
type: Integration
title: Weather
description: Per-day weather on the itinerary via Open-Meteo — a real forecast within 16 days, last year's actuals beyond it, never conflated.
resource: https://open-meteo.com/
tags: [integration, research, weather]
timestamp: 2026-08-20T00:00:00Z
---

# Schema

`src/lib/research/weather.ts`, keyless, house pattern (server-only, never throws, 24h cache).
Coordinates come from `geocode(trip.destinations[0])`, which is already cached.

⚠️ **The forecast only reaches 16 days out** — `forecast_days=17` is a hard HTTP 400. Most trip
planning happens further ahead than that, so "no forecast" is the **common** case, not an edge case.

| Date | Source | `kind` |
| --- | --- | --- |
| Within 16 days | forecast endpoint | `'forecast'` — max/min °C + % chance of rain |
| Beyond that | archive endpoint, **same calendar dates one year earlier** | `'historical'` — max/min °C + mm of rain |
| Neither can answer | absent from the result | day renders no weather at all |

**A historical reading is never presented as a forecast.** The `kind` discriminator exists so the UI
can say "Last year on this date:" in the sentence itself, not merely style it differently. Same rule
as the Wikivoyage coverage indicator ([ADR-0008](../../docs/adr/0008-grounded-research-no-generative-layer.md)):
degrade to something honest rather than something that looks authoritative.

Note it is one year's *actuals*, not a climate normal — a sample, not an average. Deliberate: one
request, and honest to describe in a sentence ([ADR-0013](../../docs/adr/0013-qol-pack-ics-duplication-weather.md)).

Forecast and historical dates are each resolved in **one batched request**, never one per day.
Attribution to Open-Meteo (CC BY 4.0) is required wherever it appears.

# Citations

[ADR-0013](../../docs/adr/0013-qol-pack-ics-duplication-weather.md).
