# Stale-docs deletion verification

**Scope:** confirm nothing pending survives only in the four items slated for deletion:
`docs/phase-3-research-layer-handoff.md`, `docs/phase-3-open-items-handoff.md`,
`docs/superpowers/plans/*`, `docs/superpowers/specs/*`.

**Method:** read both handoff docs in full; read ADR-0016, ADR-0018, ADR-0019, ADR-0010; read
README's "What's not done"; read the Phase 4 M8/M9/M10 plan and the Phase 2 sharing/export
plan+spec; dispatched three verification agents to check specific claims against the live
codebase (git log, file existence, grep) rather than trusting the docs' own "closed" markers.

**Verdict: safe to delete all four targets.** Every plan task, open item, and decision they
contain is either implemented and verified in code, or explicitly dispositioned in a surviving
ADR / README. Two items need a one-line note added elsewhere before/at deletion (see bottom).

---

## `docs/phase-3-open-items-handoff.md` — item by item

| §    | Item                                                         | Status                                                                                                                                                                                                                                                    |
| ---- | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | `ENCRYPTION_KEY` unset in Vercel                             | **Not verifiable from repo** — owner-side infra. Not recorded in any ADR/README. See note below.                                                                                                                                                          |
| 1    | OAuth secrets need rotating                                  | **Not verifiable from repo** — owner-side infra, and time-sensitive (2026-08-20 leak). Not recorded elsewhere. See note below.                                                                                                                            |
| 2.1  | No sign-out control                                          | **Implemented.** `src/components/AppHeader.tsx` + `SignOutButton.tsx`, rendered in `src/app/trips/layout.tsx` and `src/app/settings/layout.tsx`; clears caches via `postMessage` to the SW. `e2e/signout.spec.ts` exists. Recorded closed in ADR-0018 §4. |
| 2.2  | No destination timezone / ICS floating time                  | **Dispositioned** — re-confirmed stays-closed in ADR-0018 §2 and README "What's not done".                                                                                                                                                                |
| 2.3  | Weather >16 days                                             | **Dispositioned** — working as designed, ADR-0008/0013.                                                                                                                                                                                                   |
| 2.4  | Offline link-nav / RSC caching                               | **Dispositioned** — ADR-0015, "measure before building."                                                                                                                                                                                                  |
| 2.5  | Transit coverage holes (per-operator)                        | **Dispositioned** — correct behavior, ADR-0010/handoff §10.2.                                                                                                                                                                                             |
| 2.6  | `nearestStation` unused                                      | **Confirmed still true** — grepped `src`: only referenced inside `overpass.ts`/`overpass.test.ts` and a comment in `algorithmic.ts`; never called from app code. Deliberate, no action needed.                                                            |
| 2.7  | Extension popup untested                                     | **Dispositioned, not closed** — no `e2e/extension-popup*` spec exists (timeboxed attempt abandoned per plan Task A5). Recorded in README "What's not done" and ADR-0017. Survives deletion.                                                               |
| 2.8  | Extension lists owned trips only                             | **Implemented.** `tripAccessWhere` in `src/server/auth-scope.ts` is the single predicate; `listTrips` (`src/server/trips.ts`) and `listTripsForExtension` (`src/server/extensionApi.ts`) both use it. Recorded ADR-0018 §1.                               |
| 2.9  | Extension localhost host_permission                          | **Dispositioned** — personal-tool acceptance, no action.                                                                                                                                                                                                  |
| 2.10 | `MAPBOX_TOKEN` save-path not in CI                           | **Dispositioned** — by-design env split.                                                                                                                                                                                                                  |
| 2.11 | Prod smoke-only testing                                      | **Not verifiable from repo** — owner-side manual check. Not recorded elsewhere. See note below.                                                                                                                                                           |
| 3.1  | Attachments not encrypted at rest                            | **Dispositioned** — ADR-0016 §4, README "What's not done".                                                                                                                                                                                                |
| 3.2  | Attachment storage wall / DB-size monitoring                 | **Implemented.** `scripts/db-size.mts`, `npm run db:size`. Recorded ADR-0018 §3.                                                                                                                                                                          |
| 3.3  | No offline map tiles                                         | **Dispositioned** — licence limit, ADR-0015 §1.                                                                                                                                                                                                           |
| 3.4  | Transitous contact not sent                                  | **Dispositioned** — knowing deviation, ADR-0010.                                                                                                                                                                                                          |
| 3.5  | Per-instance rate limiter                                    | **Dispositioned** — ADR-0010/ADR-0001, confirmed present in ADR-0010 text.                                                                                                                                                                                |
| 3.6  | Size-capped Maps not LRUs                                    | **Dispositioned** — `ponytail:` comments in code, upgrade-if-needed.                                                                                                                                                                                      |
| 3.7  | Trip duplication per-row creates                             | **Dispositioned** — upgrade path recorded in `src/server/trips.ts` comments.                                                                                                                                                                              |
| 4.1  | Groq "not for consumer use" clause                           | **Dispositioned as open risk** — ADR-0011 and README "What's not done" both carry it. Survives deletion.                                                                                                                                                  |
| 4.2  | Groq model-id contradictions                                 | **Dispositioned** — runtime listing handles it.                                                                                                                                                                                                           |
| 4.3  | OpenRouter free-tier privacy                                 | **Dispositioned** — ADR-0011.                                                                                                                                                                                                                             |
| 4.4  | Transitous 1.8 MB payloads, no trim                          | **Dispositioned** — verified present verbatim in ADR-0010 lines 30, 69-71.                                                                                                                                                                                |
| 5.1  | Explicitly skipped features (flights, Gmail, reviews)        | **Dispositioned** — README "What's not done" + research-layer handoff §3/§8 (both being deleted, but the _decision_ — deep-link instead — needs no further record since it's a non-feature, not a pending task).                                          |
| 5.2  | Unscheduled (Wikipedia, photos, drag-and-drop)               | **Dispositioned as "not done"** — drag-and-drop explicitly listed in README "What's not done"; Wikipedia/photos were never promised and aren't referenced elsewhere, which is fine — they were "maybe someday" ideas, not decisions or commitments.       |
| 6    | Sign-out / e2e helper / db-size / CACHE_NAME bump            | **All implemented**, see above. `CACHE_NAME` confirmed bumped to `'trip-planner-v2'` in `public/sw.js` (M9, matching the layout.tsx skip-link change); M10 correctly left it unbumped since M10 didn't touch `layout.tsx`.                                |
| 7    | Process rule (re-verify third-party behavior each milestone) | Meta-guidance, not a pending task. No preservation needed — it's a lesson, not a decision.                                                                                                                                                                |

## `docs/phase-3-research-layer-handoff.md`

This document's substantive decisions (§4 decisions table, §8 roadmap, §9 resolved questions,
§10–§12 live re-verification corrections) are all superseded by their corresponding ADRs
(0008–0017) and by the open-items handoff, which itself restates every still-relevant point.
Cross-checked §10.5 ("not built, deliberately: nearestStation") and §12.5 ("extension popup not
verified") — both independently confirmed above. Nothing in this document contains a decision or
open item that isn't already carried by a surviving ADR, the open-items handoff (also being
deleted, but restating nothing this doc doesn't also restate), or README.

## `docs/superpowers/plans/2026-08-20-phase-4-open-items-and-ui.md` (M8/M9/M10)

All tasks A1–A6, B1–B11, C1–C7 spot/full-checked against the codebase (git log confirms PRs #38,
#40, #41 merged):

- **M8 (A1–A6):** all six confirmed implemented — `e2e/auth.ts` `signInAs` (adopted by all 6+
  target specs, no leftover hand-rolled sign-in), `AppHeader`/`SignOutButton`, shared
  `tripAccessWhere` predicate, `scripts/db-size.mts`, ADR-0018. A5 (extension popup Playwright
  spec) correctly absent per its own timebox-abandon clause.
- **M9 (B1–B11):** spot-checked globals.css (font-family, color-scheme, focus-visible),
  `SubmitButton`/`ConfirmSubmitButton`, confirm-dialog sites, `loading.tsx`/`error.tsx`/
  `not-found.tsx`, skip link, `CACHE_NAME` bump, responsive padding — all present as specified.
- **M10 (C1–C7):** ADR-0019 accepted and matches what shipped; `Card.tsx`, `src/lib/format.ts`
  (`formatDay`/`formatDateRange` consolidated), print `@media` block all confirmed present.

Safe to delete — this plan's job is done and its content is now historical narrative, not a
pending checklist.

## `docs/superpowers/plans/2026-08-11-phase2-*.md` and `docs/superpowers/specs/2026-08-11-*.md` (Phase 2)

Spot-checked (PRs #19/#20 long merged, Phase 3/4 docs reference this code constantly as settled):
`src/app/shared/[token]/`, `src/server/sharing.ts` (all described functions present, plus later
additions), `src/proxy.ts` matcher correctly excludes `/shared`, print/export route present. The
"deliberately deferred" items each doc lists (no map on print page, no email notifications, no
viewer→collaborator conversion, no self-leave for collaborators) match current behavior and are
intentional scope cuts, not open items — none require separate preservation.

---

## Items needing preservation before/at deletion

These three are real, are **not** recorded in any surviving ADR or README, and are the kind of
thing a fresh session would otherwise have to rediscover:

1. **`ENCRYPTION_KEY` not set in Vercel** (open-items §1) — prod AI-key saving throws until set.
2. **Two OAuth client secrets need rotating** (open-items §1) — pasted into a chat transcript
   2026-08-20; the Google one is live in Vercel and has a strict add-then-delete order.
3. **Production has only been smoke-tested** (open-items §2.11) — attachments/offline/extension
   save paths unexercised against the real prod deploy.

All three are infrastructure/owner-action items outside the repo's own record-keeping (ADRs
record _decisions_, not outstanding to-dos for the account holder), which is presumably why they
never made it into an ADR. Recommend copying these three bullets into README's "What's not done"
or a short-lived `TODO`/issue before deleting the open-items handoff, so they aren't lost with it.
