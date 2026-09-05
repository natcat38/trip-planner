---
name: feedback-stale-local-state-before-test-run
description: "Before running the local test suite (esp. e2e), rule out a stale dev server or dead Postgres container — both produce failures that look like real code bugs"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9d02ddb6-0755-4373-abc9-7b2fb429b5cc
  modified: 2026-09-05T00:00:00.000Z
---

Two separate incidents in trip-planner's Phase 3 M5 work (2026-08-20) burned real debugging time
on infrastructure, not code:

1. **Playwright's `reuseExistingServer: !CI` silently adopts a stale local dev server.** Three
   e2e tests failed because the running dev server predated a migration and was still using a
   stale Prisma client. Fix: kill any local dev server before `npm run test:e2e`.
2. **A dead local Postgres container** presents as 47 failing tests, all
   `PrismaClientKnownRequestError` on `db.user.create` — looks like a schema/code problem but is
   `docker compose up -d db` not having been run.

**Why:** both failures reproduce reliably and look exactly like a real regression (specific
assertion failures, specific error types), so the instinct is to start reading the diff. The
actual cause is process/container state left over from a previous session.

**How to apply:** before debugging a batch of e2e or db-test failures that don't obviously trace
to the current change, check for a running dev server (kill it) and that the local Postgres
container is actually up, before reading any code.
