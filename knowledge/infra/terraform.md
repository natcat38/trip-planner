---
type: Infrastructure
title: Terraform & CI/CD
description: Infrastructure as code in Terraform, deployed by GitHub Actions via OIDC with gated migrations.
resource: ../../docs/Trip_Planner_Tech_Scope.md
tags: [infra, terraform, ci-cd]
timestamp: 2026-06-15T00:00:00Z
---

# Schema

- **IaC** — Terraform provisions networking, [RDS + ECS Fargate](/infra/ecs-fargate.md), ECR, and
  Secrets Manager/SSM.
- **CI/CD** — on push to `main`: install, typecheck, lint, test, `docker build`, push to ECR
  (tagged with the commit SHA), then register a new ECS task definition revision and roll the
  service. ⚠️ GitHub **OIDC** assumes an AWS role — no long-lived `AWS_ACCESS_KEY` in repo secrets.
- **Gated migrations** — `prisma migrate deploy` runs as a one-off task **before** the service
  flips, so a bad migration fails the deploy rather than half-applying.

# Citations

[Tech Scope Task 10](../../docs/Trip_Planner_Tech_Scope.md).
