# ADR-0022: CI waits for production to serve the commit it deployed

**Status:** Accepted (2026-11-09)

Amends ADR-0002.

## Context

The `deploy` job applies migrations, then POSTs the Vercel deploy hook. The hook only queues a
build. If that build failed, the job was already green and nothing reported it. The same gap
let 14 failed Vercel builds go unnoticed in rpg-build-optimizer (its ADR-0024).

## Decision

- The root layout emits `<meta name="build-sha">` with `VERCEL_GIT_COMMIT_SHA`, which Vercel sets
  at build time (`local` elsewhere).
- After the hook, the `deploy` job polls the production homepage every 15 seconds for up to 10
  minutes. It passes once the live SHA is this commit or a later one on `main` (`git merge-base
--is-ancestor`), because the hook always builds the head of `main`. Otherwise it fails with an
  error pointing at the Vercel build log.
- A meta tag instead of a version route: CLAUDE.md keeps `/shared/[token]` as the only unauthenticated
  route, and the commit SHA is already public in this public repo.
- No new secret. Polling the Vercel API would need a `VERCEL_TOKEN` here too.

## Consequences

- A failed or stuck production build now turns the `deploy` job red on the commit.
- The job takes as long as the Vercel build, roughly 1–3 minutes more.
- A slow build of over 10 minutes reads as a failure. Raise the loop count if that becomes normal.
- The check covers the homepage's deployment only. Every route ships in the same deployment, so
  that is the whole release.
