# Phase 2 — Itinerary Export (PDF) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Dependency:** this plan assumes `docs/superpowers/plans/2026-08-11-phase2-sharing.md` has already been merged — Task 2 edits `src/app/trips/[id]/page.tsx` in the state that plan leaves it in (with the Sharing panel wired in). If sharing hasn't landed yet, adapt Task 2's diff to the file's actual current content.

**Goal:** Let a trip owner or accepted collaborator export a trip's itinerary + budget summary to PDF, per `docs/superpowers/specs/2026-08-11-phase2-sharing-export-design.md`.

**Architecture:** A dedicated `/trips/[id]/print` page, guarded by the existing `requireTripAccess`, renders a clean print stylesheet (no nav, no edit controls, no map) reusing the already-tested `ensureDaysForTrip`/`getBudgetSummary`/`listExpenses` server functions. An "Export PDF" button calls the browser's native `window.print()` — no new dependency, no server-side PDF rendering, no new server-side business logic to test.

**Tech Stack:** Next.js App Router (Server Component page + one small Client Component for the print trigger), Tailwind's `print:` variant, Playwright.

---

## Task 1: Print page + export button

**Files:**
- Create: `src/app/trips/[id]/print/page.tsx`
- Create: `src/app/trips/[id]/print/ExportButton.tsx`

- [ ] **Step 1: Implement the export button**

```tsx
// src/app/trips/[id]/print/ExportButton.tsx
'use client';

export function ExportButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838]"
    >
      Export PDF
    </button>
  );
}
```

- [ ] **Step 2: Implement the print page**

```tsx
// src/app/trips/[id]/print/page.tsx
/**
 * The print/export view: a light-mode-only (regardless of OS theme —
 * printed output should stay ink-friendly), nav-free rendering of a trip's
 * itinerary and budget summary, reached only via requireTripAccess.
 * @packageDocumentation
 */
import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import { ForbiddenOrNotFoundError, requireTripAccess } from '@/server/auth-scope';
import { getBudgetSummary } from '@/server/budget';
import { listExpenses } from '@/server/expenses';
import { ensureDaysForTrip } from '@/server/itinerary';
import { ExportButton } from './ExportButton';

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

function formatDateRange(start: Date, end: Date): string {
  const fmt = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  return `${fmt.format(start)} – ${fmt.format(end)}`;
}

export default async function TripPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let trip;
  let days;
  let budget;
  let expenses;
  try {
    trip = await requireTripAccess(id);
    [days, budget, expenses] = await Promise.all([
      ensureDaysForTrip(id),
      getBudgetSummary(id),
      listExpenses(id),
    ]);
  } catch (err) {
    if (err instanceof ForbiddenOrNotFoundError) {
      return (
        <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50">
          <p className="text-zinc-600">{err.message}</p>
        </div>
      );
    }
    throw err;
  }

  return (
    <div className="flex flex-col flex-1 bg-white">
      <main className="flex-1 w-full max-w-3xl mx-auto py-16 px-8 print:py-0 print:px-0">
        <div className="flex items-center justify-between mb-2 print:hidden">
          <Link href={`/trips/${trip.id}`} className="text-sm text-zinc-600 underline">
            Back to trip
          </Link>
          <ExportButton />
        </div>

        <h1 className="text-2xl font-semibold text-black mb-1">{trip.name}</h1>
        <p className="text-sm text-zinc-600 mb-8">
          {trip.destinations.join(', ')} ·{' '}
          {formatDateRange(trip.startDate, trip.endDate)}
        </p>

        <section className="mb-10 border border-black/[.08] rounded-lg p-5 break-inside-avoid">
          <h2 className="font-medium text-black mb-2">Budget</h2>
          <p className="text-zinc-700">
            {formatMoney(budget.spentMinor, budget.baseCurrency)} of{' '}
            {formatMoney(budget.budgetMinor, budget.baseCurrency)} planned
          </p>
          {Object.keys(budget.byCategory).length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-sm text-zinc-600">
              {Object.entries(budget.byCategory).map(([category, minor]) => (
                <li key={category} className="flex justify-between">
                  <span>{category}</span>
                  <span>{formatMoney(minor, budget.baseCurrency)}</span>
                </li>
              ))}
            </ul>
          )}
          {expenses.length > 0 && (
            <ul className="mt-4 flex flex-col gap-1 text-sm text-zinc-600">
              {expenses.map((expense) => (
                <li key={expense.id} className="flex justify-between">
                  <span>
                    {expense.label} ({expense.category})
                  </span>
                  <span>{formatMoney(expense.costMinor, expense.costCurrency)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="flex flex-col gap-8">
          {days.map((day) => (
            <section key={day.id} className="break-inside-avoid">
              <h2 className="font-medium text-black mb-3">{formatDay(day.date)}</h2>
              {day.activities.length > 0 ? (
                <ul className="flex flex-col gap-2">
                  {day.activities.map((activity) => (
                    <li
                      key={activity.id}
                      className="border border-black/[.08] rounded-lg p-4"
                    >
                      <p className="font-medium text-black">
                        {activity.title}{' '}
                        <span className="font-normal text-zinc-500">
                          ({activity.category})
                        </span>
                      </p>
                      <p className="text-sm text-zinc-600">
                        {[
                          activity.startTime && activity.endTime
                            ? `${activity.startTime}–${activity.endTime}`
                            : activity.startTime,
                          activity.placeName,
                          activity.costMinor != null && activity.costCurrency
                            ? formatMoney(activity.costMinor, activity.costCurrency)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {activity.notes && (
                        <p className="text-sm text-zinc-500 mt-1">{activity.notes}</p>
                      )}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-zinc-500">No activities planned.</p>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add "src/app/trips/[id]/print"
git commit -m "feat: print/export page for a trip's itinerary and budget"
```

---

## Task 2: Wire "Export PDF" into the trip page

**Files:**
- Modify: `src/app/trips/[id]/page.tsx`

- [ ] **Step 1: Add the link**

In `src/app/trips/[id]/page.tsx`, find the header block:

```tsx
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            {trip.name}
          </h1>
          <Link
            href={`/trips/${trip.id}/edit`}
            className="text-sm text-zinc-600 dark:text-zinc-400 underline"
          >
            Edit trip
          </Link>
        </div>
```

Replace it with:

```tsx
        <div className="flex items-baseline justify-between mb-8">
          <h1 className="text-2xl font-semibold text-black dark:text-zinc-50">
            {trip.name}
          </h1>
          <div className="flex gap-4">
            <Link
              href={`/trips/${trip.id}/print`}
              className="text-sm text-zinc-600 dark:text-zinc-400 underline"
            >
              Export PDF
            </Link>
            <Link
              href={`/trips/${trip.id}/edit`}
              className="text-sm text-zinc-600 dark:text-zinc-400 underline"
            >
              Edit trip
            </Link>
          </div>
        </div>
```

If the sharing plan hasn't landed yet and the file still has the original (pre-sharing) header block, this same replacement still applies unchanged — the header markup itself isn't touched by the sharing plan, only content further down the page.

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/trips/[id]/page.tsx"
git commit -m "feat: link to the print/export page from the trip page"
```

---

## Task 3: Manual print verification

**Files:** none (manual verification only — there is no new business logic to unit-test; the page composes three already-tested server functions)

- [ ] **Step 1: Start the stack**

```bash
docker compose up -d db
npm run dev
```

- [ ] **Step 2: Verify in browser**

Sign in, open a trip with at least one day of activities and an expense, click "Export PDF" from the trip page. Confirm:
- The print page shows the itinerary day-by-day and the budget summary, with no nav/edit buttons.
- Clicking "Export PDF" on the print page opens the browser's print dialog; the print preview shows the same content with the "Back to trip" / "Export PDF" row hidden (that's the `print:hidden` class working).
- Visiting `/trips/<id>/print` for a trip you don't own/collaborate on shows the "doesn't exist or you don't have access" message.

- [ ] **Step 3: No commit** (verification only, nothing to check in)

---

## Task 4: E2E — print page auth gate

**Files:**
- Create: `e2e/export.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { expect, test } from '@playwright/test';

// Matches this repo's existing e2e pattern (see e2e/smoke.spec.ts,
// e2e/sharing.spec.ts) of verifying the redirect/render boundary rather
// than a full OAuth click-through (no test OAuth account exists in CI).
test('the print page redirects to sign-in when signed out', async ({ page }) => {
  const response = await page.goto('/trips/nonexistent-id/print');
  await expect(page).toHaveURL(/\/api\/auth\/signin/);
  expect(response?.ok()).toBe(true);
});
```

- [ ] **Step 2: Run it**

```bash
npm run dev &
npx playwright test e2e/export.spec.ts
```

Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/export.spec.ts
git commit -m "test: e2e coverage for the print page's auth gate"
```

---

## Task 5: Verify, open PR, merge

**Files:** none (verification + git workflow only)

- [ ] **Step 1: Full verification**

```bash
npx tsc --noEmit
npm run lint
npm run format:check
docker compose up -d db
npm run test
npx playwright install --with-deps chromium
npm run test:e2e
```

Expected: everything green.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/phase2-export
gh pr create --title "feat: Phase 2 itinerary export (print/PDF)" --body "Implements docs/superpowers/plans/2026-08-11-phase2-export.md per docs/superpowers/specs/2026-08-11-phase2-sharing-export-design.md. Adds a print-friendly /trips/[id]/print page; export uses the browser's native print-to-PDF, no new dependency."
gh pr checks --watch
```

- [ ] **Step 3: Merge and clean up**

```bash
gh pr merge --squash
git checkout main && git pull
git branch -d feat/phase2-export
```

---

## Deliberately deferred (per spec)

- No map on the print page — interactive canvas assets and Mapbox network tiles don't serve a static export well; the itinerary text already carries place names.
- No server-side PDF generation library — browser print-to-PDF fully covers the spec's requirement at zero added cost/complexity.
