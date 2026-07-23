---
type: Infrastructure
title: ECS Fargate
description: The containerised production runtime — an ECS Fargate service behind an ALB, backed by RDS Postgres.
resource: ../../docs/Trip_Planner_Tech_Scope.md
tags: [infra, aws]
timestamp: 2026-06-15T00:00:00Z
---

# Schema

**Status (2026-07-23):** deferred to post-ship showcase — Phase 1 deploys on Vercel + Neon.
See [ADR-0001](../../docs/adr/0001-deploy-vercel-neon-defer-aws.md).

The app ships as a multi-stage Docker image (`output: 'standalone'`, non-root, `HEALTHCHECK`)
and runs as an **ECS Fargate** service + task definition behind an **ALB**.

- **Data** — **RDS Postgres**; an **ECR** repo holds images.
- **Secrets** — DB creds, OAuth client secret, [Mapbox](/integrations/mapbox.md) token, and the
  rates API key all come from Secrets Manager / SSM at runtime. ⚠️ Never baked into the image or
  committed.
- **Cost** — Fargate + RDS run 24/7 and cost real money; use the smallest sizes and document
  `terraform destroy` teardown (see [Terraform & CI/CD](/infra/terraform.md)).

# Citations

[Tech Scope Task 9](../../docs/Trip_Planner_Tech_Scope.md).
