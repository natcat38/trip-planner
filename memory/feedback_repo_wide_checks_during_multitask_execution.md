---
name: feedback-repo-wide-checks-during-multitask-execution
description: "When executing a multi-task plan (subagent-driven-development), run repo-wide checks (prettier --check ., file-map:check) periodically, not just per-task file-scoped checks"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9d02ddb6-0755-4373-abc9-7b2fb429b5cc
  modified: 2026-08-12T11:04:19.995Z
---

During the Phase 2 sharing plan's 16-task execution (trip-planner repo), each task's implementer
subagent ran `npx eslint`/`npx tsc --noEmit` scoped to just the files it touched, which stayed
clean throughout. But `npm run format:check` (prettier, whole repo) and `npm run file-map:check`
(the OKF knowledge-bundle generator) only got checked when a subagent happened to think of it —
by Task 16's final verification, 8 files had prettier drift and FILE-MAP.md was stale, both
needing separate fix-up commits. The FILE-MAP.md staleness also silently blocked CI once (had to
be diagnosed and fixed post-merge-attempt) because it's not just a local script — it's a real
required CI check (`validate` job via `natcat38/okf-portfolio-standard`), and it additionally
flags things a file-scoped check can't see, like a new source directory lacking a purpose
doc-comment (`src/app/shared/[token]` had no `@packageDocumentation` block until Task 16 caught
it).

**Why:** eslint/tsc are inherently file-scoped and fast to run per-task, so subagents naturally
reach for them. Prettier and the FILE-MAP generator are repo-wide/structural checks that don't
show a problem until something ELSE changes nearby (a new directory, a long import line from an
unrelated edit) — they're the kind of check that's easy to forget mid-task and cheap to catch
late, but still costs a round-trip when caught only at the end.

**How to apply:** When running subagent-driven-development for a multi-task plan in this repo (or
any repo with a repo-wide format/structure check wired into CI), run `npm run format:check` and
`npm run file-map:check` (or their local equivalents) every 3-4 tasks, not just at the final
verification step — catching drift early avoids batching multiple unrelated fix-up commits at the
end. Also worth checking CI's actual required env vars (`.github/workflows/*.yml`) whenever a new
kind of test is added (e.g. the first e2e test to touch an authenticated route) — CI env gaps
that "worked by accident" can surface for the first time on exactly this kind of PR.
