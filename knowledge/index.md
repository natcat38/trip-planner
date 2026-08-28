# Trip Planner — Knowledge

A multi-user Japan/Europe trip planner: integrated itinerary + budget with multi-currency
roll-up, maps, a grounded destination-research layer, BYOK AI day planning, offline support,
attachments, and a browser extension. **Next.js (App Router) + Prisma/Postgres + Auth.js**,
deployed to **Vercel + Neon** via a gated GitHub Actions pipeline (ADR-0001, ADR-0002). AWS
(ECS Fargate + RDS + Terraform) is a planned-but-not-built future runtime — see Infra below.

This bundle is the agent- and reviewer-readable knowledge map. The code-level breakdown lives
in [`docs/Trip_Planner_Tech_Scope.md`](../docs/Trip_Planner_Tech_Scope.md); product scope in
[`docs/Trip_Planner_Product_Scope.md`](../docs/Trip_Planner_Product_Scope.md); the full ADR
index is at [`docs/adr/README.md`](../docs/adr/README.md).

## Domain

- [Trip](/domain/trip.md) — the owned aggregate: destinations, dates, base currency, budget.
- [Itinerary](/domain/itinerary.md) — days and activities under a trip.
- [Budget](/domain/budget.md) — minor-unit money + convert-on-read currency roll-up.
- [Sharing](/domain/sharing.md) — public read-only link + invited Collaborators (Phase 2).
- [Places](/domain/places.md) — the saved-places research tray under a trip (Phase 3).
- [Day generation](/domain/day-generation.md) — multi-option candidate day plans from the tray (Phase 3).

## Integrations

- [Auth & authorization](/integrations/auth.md) — Auth.js OAuth + the `requireTripAccess`/`requireTripOwner` no-bypass rule.
- [Mapbox](/integrations/mapbox.md) — geocoding + map view, token kept server-side.
- [Research sources](/integrations/research-sources.md) — keyless Overpass/OSM places + Wikivoyage guide prose.
- [Transit routing](/integrations/transit-routing.md) — keyless Transitous journeys + map deep-link fallback.
- [BYOK AI](/integrations/byok-ai.md) — user-supplied Groq/OpenRouter key, encrypted at rest, grounded use only.
- [Weather](/integrations/weather.md) — keyless Open-Meteo forecast, degrading to last year's actuals.

## Infra (deferred — not built)

> ⚠️ Deferred to post-ship (2026-07-23): Phase 1 deploys on Vercel + Neon — see `docs/adr/0001`.

- [ECS Fargate](/infra/ecs-fargate.md) — containerised runtime behind an ALB, RDS Postgres.
- [Terraform & CI/CD](/infra/terraform.md) — IaC + GitHub OIDC deploy with gated migrations.
