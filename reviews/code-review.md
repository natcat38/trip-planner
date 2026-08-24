# Pass 3 — Code review (whole-repo, max effort)

10 finder angles → 26 candidates → 1-vote verification → sweep. 15 findings survived
(11 CONFIRMED, 2 PLAUSIBLE correctness/test-infra, 2 cleanup); 3 refuted
(transitous `undefined` render, SharingPanel setTimeout-after-unmount, db.ts pool "leak" —
pg.Pool is lazy). Full detail was reported via the review tool; fixes applied on this branch.

## Correctness (fixed)

1. `savePlace` upsert nulls saved notes/cost on re-save — data loss, no concurrency needed (places.ts:138).
2. Missing `costAmount` coerces to a valid $0 expense (actions.ts:165).
3. ICS: explicit overnight activity (23:00–01:00) emits DTEND before DTSTART (ics.ts:123).
4. Invalid Date bypasses trip date validation → raw Prisma error (trips.ts:35).
5. Update actions rethrow `ForbiddenOrNotFoundError` to the global boundary (3 files).
6. `deleteExpenseAction` / `setActivityPinColorAction` missing `ignoreIfMissing`.
7. Share-link toggles and `setActivityPinColor` skip the ADR-0003 stale-write guard;
   `moveActivity` swap races (`findIndex` −1 + unguarded updates).
8. Unhandled rejections: SignOutButton (`await action()` outside try), extension popup disconnect.

## Test-infra (fixed)

- **Likely root cause of the long-unexplained `trips.db.test.ts` flake:** 11 parallel
  `*.db.test.ts` files × pg Pool max 10 ≈ 110 connections vs Postgres's 100 ceiling —
  cleanup queries fail to acquire a connection under full-suite load. Fix: cap the pool in tests.

## Cleanup (fixed)

- TTL-cache Map pattern hand-rolled 5× (fx, geocode, transitous, weather, wikivoyage) → shared helper.
- Trip page awaits 5 independent reads sequentially → `Promise.all` (print/shared pages already do).

## Noted, not applied (below severity cap; candidates on file)

Chevron icon / SubmitButton / popup.js busy-button duplication; budget.ts twin loops;
`requireShareToken` not `cache()`d; `require*` child-row + optimistic-update + action
try/catch generalization (altitude); GUIDE_SECTIONS vs SECTION_ORDER drift risk.
