---
name: feedback-use-server-exports-must-be-async
description: "A sync export in a 'use server' module passes tsc, lint and vitest but fails `next build` (and so CI e2e); run `npx next build` before pushing anything that touches src/server/*.ts."
metadata:
  type: feedback
---

2026-09-05 on PR #52: extracting a pure `rollUp()` helper as a sync export of
`src/server/budget.ts` (a `'use server'` file) broke CI. Locally, `tsc --noEmit`, eslint and
the full vitest suite were green; only the Playwright job failed, because its web server
runs `next build`, which enforces "Server Actions must be async functions".

**Why:** Next treats every export of a `'use server'` file as a Server Action. Nothing in the
type-level or unit-test toolchain knows that rule, so the local gate lies.

**How to apply:** pure helpers go in `src/lib/` (no directive), never exported from
`src/server/*.ts` files that carry `'use server'`. Add `npx next build` to the local gate for
any change under `src/server/` or `src/app/**/actions.ts`. Related:
[[feedback-stale-local-state-before-test-run]], [[feedback-ci-env-parity-for-new-test-types]].
