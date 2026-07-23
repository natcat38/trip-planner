# Trip Planner — Knowledge

A multi-user Japan/Europe trip planner: integrated itinerary + budget with multi-currency
roll-up and maps. **Next.js (App Router) + Prisma/Postgres + Auth.js**, containerised and
deployed to **AWS (ECS Fargate + RDS)** via GitHub Actions CI/CD, infra in Terraform.

This bundle is the agent- and reviewer-readable knowledge map. The code-level breakdown lives
in [`docs/Trip_Planner_Tech_Scope.md`](../docs/Trip_Planner_Tech_Scope.md); product scope in
[`docs/Trip_Planner_Product_Scope.md`](../docs/Trip_Planner_Product_Scope.md).

## Domain

- [Trip](/domain/trip.md) — the owned aggregate: destinations, dates, base currency, budget.
- [Itinerary](/domain/itinerary.md) — days and activities under a trip.
- [Budget](/domain/budget.md) — minor-unit money + convert-on-read currency roll-up.

## Integrations

- [Auth & authorization](/integrations/auth.md) — Auth.js OAuth + the `requireTrip` no-bypass rule.
- [Mapbox](/integrations/mapbox.md) — geocoding + map view, token kept server-side.

## Infra

> ⚠️ Deferred to post-ship (2026-07-23): Phase 1 deploys on Vercel + Neon — see `docs/adr/0001`.

- [ECS Fargate](/infra/ecs-fargate.md) — containerised runtime behind an ALB, RDS Postgres.
- [Terraform & CI/CD](/infra/terraform.md) — IaC + GitHub OIDC deploy with gated migrations.
