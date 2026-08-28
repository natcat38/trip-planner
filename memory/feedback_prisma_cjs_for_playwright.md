---
name: feedback-prisma-cjs-for-playwright
description: "Prisma 7's prisma-client generator defaults to ESM output (import.meta.url), which Playwright's CommonJS test transform can't load — set moduleFormat = \"cjs\" if a Playwright test needs to import the Prisma client directly"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9d02ddb6-0755-4373-abc9-7b2fb429b5cc
  modified: 2026-08-12T12:39:39.991Z
---

In trip-planner, writing an e2e test that seeds a real database session directly via Prisma
(instead of mocking auth) hit a real blocker: `src/lib/db.ts` transitively imports the
Prisma-generated client, which used `import.meta.url` (Prisma 7's `prisma-client` generator
defaults to ESM). Playwright's Babel-based CJS test transform compiles everything to CommonJS and
has no `import.meta` rewriting plugin, so any spec file that (even transitively) imports the
Prisma client fails with `SyntaxError: Cannot use 'import.meta' outside a module`. A dynamic
`import()` at the top-level import site does NOT fix this — it only moves the failure one level
deeper, into the generated client's own static import of its ESM-only runtime.

**Why:** Vitest (Vite-based, native ESM) never hits this — only Playwright's CJS-oriented test
runner does. This is easy to miss because every existing `.db.test.ts` (Vitest) works fine, so
the ESM-only default looks harmless until the first Playwright test tries to touch the database
directly.

**How to apply:** If a Playwright/e2e test in a Prisma 7 (`prisma-client` generator) project needs
to import the Prisma client (directly or transitively via something like `src/lib/db.ts`), add
`moduleFormat = "cjs"` to the `generator client { ... }` block in `schema.prisma` and regenerate.
This is a repo-wide change (every consumer of the generated client switches format) — confirmed
low-risk in this project (full typecheck/lint/vitest/`next build`/existing-e2e all still passed
after switching), but **ask the user before making the change**, since the blast radius extends
well beyond the one test file that triggered the need — this is exactly the kind of infra decision
[[feedback_branch_before_writing]]'s spirit (don't silently make repo-wide calls) also covers.
