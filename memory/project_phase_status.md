---
name: project-phase-status
description: "Phases 1-4 all merged and live. ROADMAP.md (added 2026-09-05) now tracks lifecycle stage; this file is the historical decision/pitfall log behind it. Current stage: Review, next up the 2026-09-05 full-repo catch-and-enhance pass."
metadata:
  node_type: memory
  type: project
  originSessionId: 9d02ddb6-0755-4373-abc9-7b2fb429b5cc
  modified: 2026-09-05T00:00:00.000Z
---

## Current state (2026-09-05)

`ROADMAP.md` now exists and is the source of truth for lifecycle stage — read it first.
**Current stage: Review → Ship.** The 2026-09-05 full-repo catch-and-enhance pass ran on branch
`chore/full-repo-scan-2026-09` (repo-review, architecture, tech-debt, testing-strategy,
design/a11y recheck, documentation, memory consolidation; 4+4 Sonnet subagents, reports kept in
the session scratchpad, not the repo). Result: the codebase was already clean — 0 P0/P1, one P2
(extension place upsert has no ADR-0003 check; documented as a deliberate exception since the
popup never reads the row), 4 token-convergence swaps, pure `rollUp` extracted from
`summarizeBudget`, `validation.test.ts` added, minor/patch dep bumps, FILE-MAP generator now
prefers entry files. Follow-ups done in the same PR: `src/app/trips/loading.tsx` (covers list + new; `trips/[id]/loading.tsx`
already covered edit routes), ui-ux-audit docs folded into [[project-ui-ux-audit-2026-08]] and
deleted, `docs/handoff-major-upgrade-spike.md` written for the major-version spike (TS 7, ESLint 10,
Vitest 5, Next 16.3, Prisma 8, Node 22 first). One CI break caught and fixed: sync export in a
`'use server'` file — see [[feedback-use-server-exports-must-be-async]]. Waived: `@packageDocumentation`
blocks describing `src/server`/`src/lib` as directories (cosmetic, FILE-MAP header explains the source).
Next: a final `/repo-review` for Ship, then the next feature spec.

Phases 1-4 are all merged and live in production (ADRs 0001-0019 in `docs/adr/`), plus all five
items from the 2026-08-28 audit handoff (PR #50). Nothing is mid-flight. All Phase-3 planning
docs (`docs/phase-3-*-handoff.md`, `docs/superpowers/`) and the `reviews/` folder are deleted —
their content was triaged and folded into this file and [[project-repo-review-2026-08]] before
removal, per the user's preference not to have agents hunting information in the repo.

Below is a dated timeline, oldest first, kept short — read [[project-repo-review-2026-08]] for
the 2026-08-24/25 repo-review in full, and an ADR for the reasoning behind any decision.

## Timeline

**2026-07-29 — Phase 1 live** (Milestones 0-7: scaffold, schema, auth, trips, itinerary, budget,
maps). Deploy pipeline per ADR-0002 (gated Actions job runs `prisma migrate deploy` then a Vercel
deploy hook). Account-side setup (`docs/deploy-setup.md`) complete: Neon, Vercel
(`natcat38s-projects/trip-planner`), Google/GitHub OAuth, Mapbox, exchangerate-api.com.
**Pitfall (PR #10/#11):** Vercel's "Ignored Build Step" dashboard setting cancels Deploy
Hook-triggered deploys too, not just git pushes. Fixed with `vercel.json`'s
`git.deploymentEnabled.main = false` instead, which only gates git-push triggers.
**How to apply:** for any Vercel+Actions gated-deploy pattern, use `git.deploymentEnabled` in
`vercel.json`, never the Ignored Build Step control.

**2026-08-11/12 — Phase 2 (sharing + export) specced, executed, merged** (PR #19, #20).
ADR-0006 (Collaborator matched by email, not a User FK) and ADR-0007 (export via browser
print-to-PDF, staying inside ADR-0001's $0/month). Real bugs caught: information exposure in
`getSharedTrip` (leaked `userId`/`shareToken`), missing `noindex` on `/shared/[token]`, two CI
env gaps (`AUTH_SECRET` missing from the `quality` job — see the recurring pattern in
[[feedback_ci_env_parity_for_new_test_types]]). Prisma 7's ESM-default client broke Playwright's
CJS transform — see [[feedback_prisma_cjs_for_playwright]] for the fix (`moduleFormat = "cjs"`,
asked and confirmed low-risk first).

**2026-08-19 — Phase 3 researched and decided**, not yet built:
`docs/phase-3-research-layer-handoff.md` (since retired, see below) held a verified M1 plan plus
a user-decided M2-M7 roadmap. Key falsified assumptions from that research pass (kept here since
the doc is gone): OSM/Overpass has no admission-fee data outside 2.8% of attractions and zero
restaurant prices; Gemini's free tier is EEA/UK/Swiss ToS-blocked; GitHub Models is retired;
Google Routes API is doubly blocked; star ratings are structurally unfree. See
[[feedback_verify_plan_assumptions_before_approval]] for how these were found.

**2026-08-20 — Phase 3 Milestones 1-7 all merged, Phase 3 complete** (PRs #25/26, #29, #30, #31,
#32, #33/35, #36, #37; ADRs 0008-0017). One live-verification surprise per milestone — the
recurring lesson (per `docs/phase-3-open-items-handoff.md`, since retired) was that each
milestone needs its own live-API re-check before building, not research-then-build on faith:
- **M1** (places/Overpass/Wikivoyage, ADR-0008/0009): wikitext stripper dropped price-bearing
  `{{templates}}`; Overpass search terms need regex-escaping; requiring plain `name` misses
  `name:ja-Latn`-only bus stops.
- **M2** (Transitous transit, ADR-0010): coverage is per-operator not per-city (Kyoto's buses
  aren't in the feed); repo went MIT-licensed because Transitous's usage policy requires it.
  Enforced restraint in code (rate cap, cache, circuit breaker) instead of the contact email
  their policy asks for — revisit if usage ever grows past personal scale.
- **M3** (BYOK AI, ADR-0011): Groq is the default (not OpenRouter — OpenRouter's free tier
  requires training-on-prompts permission). Security bug: `'use server'` on
  `src/server/aiSettings.ts` made every export, including the key-decrypting one, a public HTTP
  endpoint — never put that directive on a module with a secret-returning export.
- **M4** (guided day generation, ADR-0012): output is constrained to place **ids**, validated
  server-side against the trip's saved-places pool — a hallucinated place has no code path to
  the screen. Data minimization: model sees id/name/category/cuisine only.
- **M5** (ICS/duplication/weather/checklists/votes, ADR-0013/0014): ICS uses floating local time
  (app has no destination timezone); duplication never copies `shareToken`, collaborators, or
  votes; weather forecast maxes at 16 days; `Day.notes` is deliberately world-readable via
  `/shared/[token]` — any new `Day` field inherits that, check before adding one.
- **M6** (offline PWA + attachments, ADR-0015/0016): Mapbox tiles can't be cached (12h device TTL,
  no ToS grant); attachment caps are 4MB/file, 20MB/trip (Vercel's 4.5MB request/response limit,
  Neon free tier's 0.5GB total). Security bug found by measurement, not test: the
  session-end cache-clear checked `response.redirected`/`.url`, both unpopulated for navigation
  requests (`type === 'opaqueredirect'` is the correct check) — see
  [[feedback_measure_dont_assume_api_behavior]].
- **M7** (browser extension, ADR-0017): bearer token, not the session cookie (removes CSRF
  exposure entirely rather than defending against it); `/api/*` is not in `src/proxy.ts`'s
  matcher and must self-authenticate. Upsert bug: one payload used for both create and update
  erased notes on re-save — see [[feedback_upsert_create_update_payload_divergence]].

**2026-08-24/25 — Phase 4 (M8-M10) merged, then a full `/repo-review`** (PRs #38, #40, #41;
ADR-0018/0019 "departure board" direction) followed by 13 verified correctness fixes, design
tokens, README rewrite, and a production demo trip — full detail in
[[project-repo-review-2026-08]], including the `PG_POOL_MAX` test-flake root cause (11 parallel
`*.db.test.ts` files × pg Pool max 10 vs Postgres `max_connections=100`) and the destination-bias
geocoding bug found only by driving the live app.

**2026-09-02 — All five 2026-08-28 audit-handoff items shipped** in one PR (#50, `298fe66`,
deployed), each verified by a subagent before implementation:
- Rate limiting on the unauthenticated boundary: Postgres fixed-window counter
  (`RateLimitBucket` + `src/server/rateLimit.ts`). 5/hour on `duplicateSharedTrip`, 30/min on
  `/api/extension/*`. Chosen over in-memory LRU since per-instance state can't bound abuse on
  serverless. Review caught the rate-limit check running before auth/token validation
  (anonymous callers could drain a share token's budget) and a missing cleanup path for
  `RateLimitBucket` rows (fixed with 1% probabilistic stale-row deletion, no cron, per ADR-0001).
- `ItineraryDays` split into a server component + client islands (`src/app/trips/[id]/
  ItinerarySelection.tsx`, `DayTiming.tsx`) sharing one `NowProvider` clock.
- `src/server/validation.ts` (`requireText`/`requireOptionalText`) replaced five per-file copies.
- CI: `concurrency` cancellation on both workflows, main excluded so `prisma migrate deploy`
  can never be killed mid-run.
- Playwright: `trace: 'on-first-retry'` + failure artifact upload.

`docs/phase-3-open-items-handoff.md` was retired in PR #43 (2026-08-24) after every item was
verified implemented or explicitly dispositioned (ADR-0018 records the ones that needed a
decision rather than code); this PR closed the remaining actionable ones. **No known Phase 3/4
follow-up items are open as of 2026-09-02** beyond what ROADMAP.md's Review stage lists.
