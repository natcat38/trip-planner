# Memory Index

Agent memory for this repo, kept **in the repo** so it survives machine changes
and works for any agent without a `~/.claude` folder. Read this file at session
start; read a linked file when its hook looks relevant.

To add a memory: create `memory/<type>_<slug>.md` with frontmatter
(`name`, `description`, `metadata.type` = user | feedback | project | reference),
then add one line here. One fact per file. Link others with `[[name]]`.
Update or delete stale files instead of duplicating them.


- [2026-08 repo-review record](project_repo_review_2026-08.md) — replaces the repo's deleted reviews/ folder; fixes shipped, pass conclusions, flake root cause, standing decisions.
- [Use subagents for plan execution](feedback_subagent_plan_execution.md) — subagent-driven-development for plan execution; operating rules live in the global CLAUDE.md "Subagents & Token Economy" section.
- [Trip-planner phase status](project_phase_status.md) — Phases 1-4 all merged and live, nothing mid-flight; top of the file is the current state, the rest is an append-only log of past decisions. Read before proposing follow-up work.
- [Prisma CJS for Playwright](feedback_prisma_cjs_for_playwright.md) — Prisma 7's ESM-default generated client breaks Playwright's CJS test transform; use moduleFormat = "cjs" (ask first, repo-wide blast radius).
- [Branch before writing](feedback_branch_before_writing.md) — always `git checkout -b` before any Write/Edit, even docs; caught two near-misses committing to main directly.
- [Run repo-wide checks mid-execution](feedback_repo_wide_checks_during_multitask_execution.md) — prettier/file-map drift only shows up at the end otherwise; check every 3-4 tasks during subagent-driven-development.
- [Verify plan assumptions before approval](feedback_verify_plan_assumptions_before_approval.md) — dispatch subagents to falsify a plan's facts before ExitPlanMode; caught 6 bad assumptions incl. a public /settings route.
- [No loading.tsx on /settings](project_settings_loading_breaks_token_flow.md) — a route-level skeleton there stalls the extension-token action past 20s and fails extension-api e2e; error.tsx is fine.
- [Opus skill subagents stall](feedback_opus_skill_subagents_stall.md) — heavy design skills trip the 600s watchdog; prompt "work incrementally", resume stalls via SendMessage.
