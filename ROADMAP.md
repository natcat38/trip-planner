# Roadmap — trip-planner

**Current stage: Ship**
**Next up:** merge PR #52, run the major-version upgrade spike from `docs/handoff-major-upgrade-spike.md`, then a final `/repo-review` before the next feature spec.

Lifecycle: Define → Plan → Build → Verify → Review → Ship.
Agents: read this file at session start, state the current stage and next unchecked item before any other work, and update this file (checkboxes + Current stage + Next up) before ending. Product and design decisions belong to the user — elicit them with questions, never decide for them.

Added retroactively on 2026-09-05: Phases 1-4 shipped before this file existed, so stages 1-4 are checked against the artifacts that already exist. Day-to-day work still runs through `/milestone` (see CLAUDE.md); this file tracks lifecycle stage only.

## 1 · Define — why this exists (before any code)

- [x] Who/pain paragraph — `docs/Trip_Planner_Product_Scope.md` §1.
- [x] Recruiter sentence — README opening.
- [x] Cut line — Phase 1 (itinerary + budget + maps), see Product Scope phases.
- [x] `docs/Trip_Planner_Product_Scope.md` (house name `Product_Scope.md`).

Exit: signed off. Skills: superpowers:brainstorming, grill-with-docs, feature-scope-docs.

## 2 · Plan — how it gets built

- [x] `docs/Trip_Planner_Tech_Scope.md` (house name `Tech_Scope.md`); AWS section superseded by ADR-0001.
- [x] ADRs 0001–0019 in `docs/adr/`.
- [x] Design direction — ADR-0019 (departure-board direction) stands in for `docs/Design_Direction.md`.

Exit: approved. Skills: superpowers:writing-plans, to-issues, hallmark.

## 3 · Build — the only stage where feature code happens

- [x] Day-1 hygiene: .gitignore, README, OKF bundle + `okf.yml` validator, `ci.yml`, branch protection, docker-compose, env-var config.
- [x] Phases 1-4 vertical slices merged (see `memory/project_phase_status.md`).

Exit: CI green. Skills: tdd, ponytail.

## 4 · Verify — does the real thing work

- [x] End-to-end on prod: `npm run test:e2e:prod` smoke + Playwright suites.
- [x] UI states / 375px / focus — 2026-08-28 audit (PR #49, record in `memory/project_ui_ux_audit_2026-08.md`).

Exit: no known broken flows. Skills: run, webapp-testing, diagnose.

## 5 · Review — quality gate before polish

- [x] `/code-review high --fix` — 2026-08-24 (PR #42).
- [x] `/simplify` — folded into PR #42/#50.
- [x] web-design-guidelines audit — PR #49.
- [x] 2026-09-05 full-repo catch-and-enhance pass (branch `chore/full-repo-scan-2026-09`): repo-review, architecture, tech-debt, testing-strategy, design/a11y recheck, documentation, memory consolidation.

Exit: findings addressed or explicitly waived. Skills: code-review, simplify, web-design-guidelines.

## 6 · Ship — recruiter-ready

- [x] README rewrite with screenshots (PR #42).
- [ ] API docs — n/a unless the extension API grows (ADR-0017); revisit at next feature spec.
- [x] Deployed demo — https://trip-planner-cyan-five.vercel.app
- [ ] Final `/repo-review` clean after the 2026-09 pass.

Exit: /repo-review comes back clean. Skills: repo-review.

## House rules

- Docs before code; scope doc changes are cheaper than code changes.
- Enforcement lives in the backend; the UI mirrors it.
- One well-finished project beats three tutorial follow-alongs.
- If a stage feels like ceremony for a tiny project, shrink the doc to a few sentences — but never skip the stage.
