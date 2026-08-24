---
type: Infrastructure
title: Terraform & CI/CD
description: Infrastructure as code in Terraform, deployed by GitHub Actions via OIDC with gated migrations.
resource: ../../docs/Trip_Planner_Tech_Scope.md
tags: [infra, terraform, ci-cd]
timestamp: 2026-06-15T00:00:00Z
---

# Schema

**Status (2026-08-24):** planned, not deployed. The app is deployed and running in production
on Vercel + Neon (Phases 1–4), via the gated GitHub Actions pipeline described in
[`docs/deploy-setup.md`](../../docs/deploy-setup.md). This document describes a possible future
AWS runtime that has not been built. See [ADR-0001](../../docs/adr/0001-deploy-vercel-neon-defer-aws.md).

- **IaC** — Terraform would provision networking, [RDS + ECS Fargate](/infra/ecs-fargate.md), ECR,
  and Secrets Manager/SSM.
- **CI/CD (if built)** — on push to `main`: install, typecheck, lint, test, `docker build`, push
  to ECR (tagged with the commit SHA), then register a new ECS task definition revision and roll
  the service. ⚠️ GitHub **OIDC** would assume an AWS role — no long-lived `AWS_ACCESS_KEY` in
  repo secrets. The actual production pipeline today is `.github/workflows/ci.yml`, gating a
  Vercel deploy hook — see `docs/deploy-setup.md`.
- **Gated migrations** — the same principle applies to the real pipeline: `prisma migrate
  deploy` runs against Neon before the Vercel deploy hook is called, so a bad migration fails
  the deploy rather than half-applying.

# Citations

[Tech Scope Task 10](../../docs/Trip_Planner_Tech_Scope.md).
