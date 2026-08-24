# Over-Engineering Audit — trip-planner

Whole-repo ponytail-audit. `src/` was scanned directly (app/components/lib/server) and
found lean: no hand-rolled stdlib, no factory/strategy patterns with a single
implementation, no dead env vars or exported-but-unused functions. Every non-obvious
piece of complexity found (rate limiter + circuit breaker in `research/transitous.ts`,
per-key caches in `fx.ts`/`geocode.ts`/`transitous.ts`, thin `Select`/`Card` wrappers)
carries an inline rationale or an ADR reference, and several `ponytail:`-tagged shortcuts
are already accepted debt (LRU-less caches, no-TSP day planner, `window.confirm` in
place of a dialog) — not new findings. **The real cut opportunity is stale docs, not code.**

## Findings, ranked by size of cut

1. **delete:** `docs/superpowers/plans/2026-08-11-phase2-sharing.md` (2264 lines),
   `docs/superpowers/plans/2026-08-11-phase2-export.md` (374 lines),
   `docs/superpowers/specs/2026-08-11-phase2-sharing-export-design.md` (102 lines) —
   Phase 2 implementation plans/specs from 2026-08-11. Phase 2 merged long ago; repo is
   now at Phase 4 M10. **Replacement:** nothing — the decisions they captured either
   shipped (see git history) or were superseded by later ADRs. Archive outside the repo
   if the planning trail has value, don't ship it as `docs/`.
   `docs/superpowers/plans/2026-08-20-phase-4-open-items-and-ui.md` (570 lines) is more
   recent (Phase 4) — lower priority to cut, same category once Phase 4 fully closes.

2. **delete:** `docs/phase-3-open-items-handoff.md` (349 lines) and
   `docs/phase-3-research-layer-handoff.md` (755 lines) — session handoff docs written
   2026-08-19/20, both stamped "Phase 3 is complete." Phase 3 and Phase 4 are both now
   done (README/ADR-0018/0019). Their content (rationale for AI-provider choices,
   grounding decisions) is durable knowledge that already has a permanent home in
   `knowledge/integrations/*.md` and `docs/adr/000{8-17}`. **Replacement:** nothing —
   cross-check that any fact in these two docs not already in an ADR/`knowledge/` file
   gets folded in, then delete both. Last touched 2026-08-23, so re-verify before cutting.

3. **yagni/stale:** `knowledge/infra/ecs-fargate.md` (27 lines) and
   `knowledge/infra/terraform.md` (25 lines) describe the AWS/ECS/Terraform deployment
   that ADR-0001 explicitly **superseded** for Phase 1 (Vercel + Neon is "THE
   deployment" now, AWS deferred to an optional future milestone). `knowledge/index.md:5`
   still states the app "is deployed to AWS (ECS Fargate + RDS) via GitHub Actions
   CI/CD, infra in Terraform" as unqualified present-tense fact — actively misleading
   to anyone who reads `knowledge/index.md` before `docs/adr/0001`. **Replacement:**
   either (a) delete both infra docs and the two `knowledge/index.md` links until the
   optional AWS milestone actually happens, or (b) keep them but reword as "designed,
   not deployed — see ADR-0001" so the knowledge bundle doesn't contradict the ADR it's
   supposed to summarize.

4. **shrink (trivial, not recommended):** `src/server/auth-scope.ts:65` re-exports
   `tripAccessWhere` from `trip-access-where.ts` as a pure pass-through. It's a 1-line,
   already-commented, intentional convenience (keeps existing import paths after a
   test-ability split) — flagged only for completeness, not worth touching.

## Not flagged (checked, found justified)

- `research/transitous.ts` token-bucket + circuit breaker: ~40 lines replacing a
  dependency the team deliberately chose not to add.
- `next.config.ts`, `eslint.config.mjs`, `vitest.config.ts`, `scripts/gen-file-map.mjs`:
  all small, zero-dependency, comment-justified.
- `.superpowers/sdd/` (8.2 MB of task briefs/reports/diffs/screenshots) — not tracked
  by git (locally gitignored), so out of scope for a repo audit; flagging only in case
  it's meant to be cleaned from disk.

net: -4470 lines, -0 deps possible (all cuts are docs, not code or dependencies).
