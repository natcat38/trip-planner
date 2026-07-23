# ADR-0001: Deploy on Vercel + Neon; defer AWS to post-ship

**Status:** Accepted (2026-07-23)

## Context
The scope docs assumed an always-on AWS deployment (ECS Fargate + RDS + ALB), which costs
~$40–70/month. The owner requires **$0/month ongoing cost**. For recruiter-facing value, a
README architecture diagram + live URL + green CI carries most of the signal; the actual
Terraform only pays off with engineers who dig in during technical screens.

## Decision
- Production is **Vercel (Hobby, free) + Neon Postgres (free tier)**. This is THE deployment.
- Terraform / ECS / RDS / production Dockerfile move to an **optional post-ship milestone**:
  built and applied once for demo proof (~$1–5 total), destroyed the same day, and only if
  job-search feedback shows an infra-signal gap.

## Consequences
- Supersedes Tech Scope Tasks 8–9 and the Phase-1 status of `knowledge/infra/*`.
- Frees ~4 dev-days: ~2 go to the gated pipeline (ADR-0002), ~2 become schedule buffer.
- Maps (Task 7) is no longer the designated trim item — the buffer absorbs overruns.
