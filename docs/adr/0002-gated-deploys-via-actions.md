# ADR-0002: Gated deploys — GitHub Actions owns the release

**Status:** Accepted (2026-07-23)

## Context
Vercel's built-in git auto-deploy is zero-config: it deploys `main` on push regardless of
migration state, bypassing the tech scope's gated-migration principle ("a bad migration fails
the deploy rather than half-applying").

## Decision
On push to `main`, GitHub Actions runs: quality gate (typecheck, lint, unit, e2e) →
`prisma migrate deploy` against Neon → **only on success** triggers the Vercel deploy via a
deploy hook. Vercel's git auto-deploy of `main` is disabled. Pull requests run the quality
gate only.

## Consequences
- Replaces Tech Scope Task 10's ECS deploy step with a Vercel deploy hook.
- A failed migration blocks the release; the DB is never ahead of or behind shipped code.
- Pairs with branch protection on `main` (requires-PR + green CI, house ruleset).
