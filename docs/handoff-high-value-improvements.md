# Handoff: high-value improvements (from 2026-08-28 repo audit)

Source: 4-agent repo audit (server/security, tests/CI, docs/DX, frontend), 2026-08-28.
These five were ranked high-value and are handed off as-is. Each deserves its own
scoped branch/PR (items 1, 2 are milestone-ish; 3–5 are small). Read CLAUDE.md
non-negotiables and the prior repo-review memory before starting. Delete this file
when the work is done or tracked elsewhere.

## 1. Rate limiting on the unauthenticated boundary

- **Where:** `/shared/[token]` (esp. `duplicateSharedTrip` in `src/server/sharing.ts`),
  `/api/extension/places`, `/api/extension/trips`.
- **Problem:** no throttling anywhere. `duplicateSharedTrip` opens a 20s-timeout
  transaction doing 100+ sequential creates, callable repeatedly by anyone with a share
  link. The extension save path triggers a live Mapbox geocode per request. Unbounded
  DB load + external-API spend with no session — threatens the $0/month constraint
  (ADR-0001).
- **Suggested shape:** coarse per-IP / per-token fixed-window counter. Given $0/month:
  in-memory LRU (accepting per-instance limits on Vercel), a Postgres counter, or
  Upstash free tier. Even coarse is far better than nothing. Record the choice as an ADR
  if it adds a service.

## 2. Split `ItineraryDays.tsx` into server markup + client islands

- **Where:** `src/app/trips/[id]/ItineraryDays.tsx` (611 lines, all `'use client'`).
- **Problem:** only two things genuinely need the client — `selectedActivityId`
  (drives `Map` pin selection) and `useNow()` ("Today"/"Next" badges). Forms bound to
  server actions, icons, formatting helpers, and the pin-colour palette UI all ship to
  the client bundle needlessly. Largest client-bundle win available.
- **Suggested shape:** server-rendered day list + two small client islands (pin
  selection, now-badges). Follow the existing pattern in `BudgetPanel.tsx` /
  `SharedTripView.tsx`. **Preserve** the unawaited-weather-promise + `use()` Suspense
  streaming (`DayWeatherLine`) — it's a deliberate, good pattern.

## 3. Input validation consistency in `expenses.ts` / `itinerary.ts`

- **Where:** `src/server/expenses.ts` (`validateExpenseInput` checks amount/currency
  only, never `label`/`category`); `src/server/itinerary.ts` (`validateActivityInput`
  checks cost only, never `title`/`category`/`notes`/`placeName`).
- **Problem:** empty/whitespace-only or unbounded strings persist fine — inconsistent
  with `checklist.ts` (`validateLabel`), `places.ts` (`validatePlaceName`), and
  `extensionApi.ts` (`MAX_NAME_LENGTH`/`MAX_NOTES_LENGTH`). Not exploitable, but a
  trust-boundary inconsistency and a UX foot-gun (empty itinerary/budget rows).
- **Suggested shape:** copy the existing trim + non-empty + max-length pattern from the
  sibling files. Add the matching unit tests in the existing `*.test.ts` pairs.

## 4. CI concurrency cancellation

- **Where:** `.github/workflows/ci.yml` and `.github/workflows/okf.yml` — neither has a
  `concurrency:` block.
- **Problem:** every push to an open PR runs the slow `quality` job (tsc, lint,
  coverage, `next build` + full Playwright) to completion even when superseded.
- **Suggested shape:**
  `concurrency: { group: "${{ github.workflow }}-${{ github.ref }}", cancel-in-progress: true }`
  in both workflows. Consider excluding `main` pushes from cancellation so a deploy-run
  is never killed mid-migration (the deploy job runs `prisma migrate deploy` — check
  ADR-0002 before enabling cancellation on main).

## 5. Playwright failure artifacts (and maybe worker pinning) in CI

- **Where:** `playwright.config.ts` (no `trace`/`screenshot`/`video` keys),
  `ci.yml` (no artifact upload step).
- **Problem:** the config's own comments document contention-driven flakiness on the
  2-core CI runner (hence `retries: 2`), but a CI e2e failure leaves no trace to open —
  only pass/fail. Undebuggable without local repro.
- **Suggested shape:** `use: { trace: 'on-first-retry' }` + an
  `actions/upload-artifact` step (if: failure()) for `playwright-report/` and
  `test-results/`. Separately, experiment with `workers: process.env.CI ? 1 : undefined`
  — may reduce the contention that the retries compensate for. Measure, don't assume.
