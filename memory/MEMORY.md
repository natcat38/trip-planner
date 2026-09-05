# Memory Index

Agent memory for this repo, kept **in the repo** so it survives machine changes
and works for any agent without a `~/.claude` folder. Read this file at session
start; read a linked file when its hook looks relevant.

To add a memory: create `memory/<type>_<slug>.md` with frontmatter
(`name`, `description`, `metadata.type` = user | feedback | project | reference),
then add one line here. One fact per file. Link others with `[[name]]`.
Update or delete stale files instead of duplicating them.


- [Trip-planner phase status](project_phase_status.md) — Phases 1-4 merged and live, ROADMAP.md now tracks lifecycle stage; this is the dated decision/pitfall timeline + ADR pointers behind it.
- [2026-08 repo-review record](project_repo_review_2026-08.md) — 2026-08-24/25 `/repo-review`: fixes shipped (PR #42/#43), pass conclusions, PG_POOL_MAX flake root cause, prod demo trip, browser-automation gotchas.
- [No loading.tsx on /settings](project_settings_loading_breaks_token_flow.md) — a route-level skeleton there stalls the extension-token action past 20s and fails extension-api e2e; error.tsx is fine.
- [Use subagents for plan execution](feedback_subagent_plan_execution.md) — subagent-driven-development for plan execution; operating rules live in the global CLAUDE.md "Subagents & Token Economy" section.
- [Verify plan assumptions before approval](feedback_verify_plan_assumptions_before_approval.md) — dispatch subagents to falsify a plan's facts before ExitPlanMode; caught 6 bad assumptions incl. a public /settings route.
- [Run repo-wide checks mid-execution](feedback_repo_wide_checks_during_multitask_execution.md) — prettier/file-map drift only shows up at the end otherwise; check every 3-4 tasks during subagent-driven-development.
- [Branch before writing](feedback_branch_before_writing.md) — always `git checkout -b` before any Write/Edit, even docs; caught two near-misses committing to main directly.
- [Prisma CJS for Playwright](feedback_prisma_cjs_for_playwright.md) — Prisma 7's ESM-default generated client breaks Playwright's CJS test transform; use moduleFormat = "cjs" (ask first, repo-wide blast radius).
- [CI env parity for new test types](feedback_ci_env_parity_for_new_test_types.md) — first test of a new shape (auth, decryption, 3rd-party call) needs its env diffed against ci.yml; recurred 3x (AUTH_SECRET, ENCRYPTION_KEY, deliberately-absent MAPBOX_TOKEN).
- [Stale local state before test runs](feedback_stale_local_state_before_test_run.md) — a stale dev server or dead local Postgres produces failures that look like real code bugs; rule those out first.
- [Measure, don't assume, API behavior](feedback_measure_dont_assume_api_behavior.md) — a security control that depends on an edge-case API return value (e.g. fetch() on a navigation redirect) needs the value measured, not assumed; no runtime symptom when wrong.
- [Upsert create/update payload divergence](feedback_upsert_create_update_payload_divergence.md) — reusing one payload for both create and update silently erases fields the caller defaults to empty on the other path.
- [Stacked PR squash-merge recovery](feedback_stacked_pr_squash_merge_recovery.md) — squash-merging a base PR auto-closes anything stacked on it; recover with `git rebase --onto` + a new PR, the old one can't reopen.
- [Opus skill subagents stall](feedback_opus_skill_subagents_stall.md) — heavy design skills trip the 600s watchdog; prompt "work incrementally", resume stalls via SendMessage.
