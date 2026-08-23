# Phase 4 — Open-Items Closure + UI/UX Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close every item in `docs/phase-3-open-items-handoff.md` (build, delegate to owner, or record as deliberately closed) and fix the converged findings of three independent UI/UX audits (web-interface-guidelines, ui-ux-pro-max, frontend-design) run against the whole repo on 2026-08-20.

**Architecture:** Three milestones. **M8** ships the small high-value gaps (sign-out + header, shared-trips listing, e2e auth helper, db-size check, extension e2e retry). **M9** is the UI compliance pass — accessibility, loading states, contrast, dark-mode, responsive — built on a handful of shared primitives (`SubmitButton`, `ConfirmSubmitButton`, global focus/color-scheme CSS) so ~60 per-site fixes become mechanical swaps. **M10** (owner-approval-gated) is the design elevation: tokens, type scale, budget visualization, signature itinerary treatment, print stylesheet.

**Tech Stack:** Next.js 16 App Router (note: `src/proxy.ts`, not middleware) · React 19 · Tailwind v4 (`@theme inline` in `globals.css`) · Prisma (generated client under `src/generated/`, CJS moduleFormat) · Auth.js v5 · Vitest + Playwright.

## Global Constraints

- **Money:** integer minor units + ISO 4217. Never floats. (CLAUDE.md)
- **Authorization:** nested resources only via `requireTripAccess(tripId)`; delete/sharing via `requireTripOwner(tripId)`. (CLAUDE.md)
- **Public route:** `/shared/[token]` is the only unauthenticated route; strip owner/token fields in `src/server/sharing.ts`, never at the component layer. (CLAUDE.md)
- **Concurrency:** mutations carry `updatedAt`, reject stale writes (ADR-0003).
- **$0/month:** no always-on paid infra (ADR-0001). Prod deploys only via the gated GitHub Actions pipeline (ADR-0002).
- **Secrets:** `.env` (gitignored) / Vercel env only.
- **Process rule (handoff §7):** every milestone gets a planning pass that re-verifies third-party behaviour against the live API before building. This plan's pass ran 2026-08-20; its corrections are already folded in (see Part 0, items 2.2 and §6-c). If execution starts more than ~a month later, re-verify Open-Meteo, Neon plan limits, and Playwright extension docs before M8.
- **Branching:** `git checkout -b` before any write; one PR per milestone; commit after each task.
- **Repo-wide checks:** run `npm run lint` + `npm run format` + `npm run test` every 3–4 tasks during execution, not just at the end (recorded user feedback).
- **New decisions → `docs/adr/`.** Next free number is **0018**.
- **Bump `CACHE_NAME` in `public/sw.js`** in any PR that touches `src/app/layout.tsx` (M9 does; it is an explicit step there).
- **Import alias:** use the same `@/…` (or relative) import style as the file's neighbours — check one adjacent file before writing imports.

---

# Part 0 — Disposition of every handoff item

Every numbered item in `docs/phase-3-open-items-handoff.md`, with what this plan does about it. "Stays closed" means the recorded decision stands; do **not** re-litigate during execution.

| Item | Disposition |
| --- | --- |
| §1 ENCRYPTION_KEY unset in Vercel | **Owner checklist** (below). Code cannot fix. |
| §1 OAuth secret rotation | **Owner checklist** (below). |
| §2.1 No sign-out control | **Build — Task A2.** Calls `caches.delete` directly, per the handoff's note. |
| §2.2 No destination timezone / ICS floating time | **Stays closed, decision re-confirmed with new evidence.** Live verification (2026-08-20) found RFC 5545 requires a `VTIMEZONE` component per unique TZID — the upgrade is a generator rewrite plus a schema migration plus a multi-zone-trip decision, *more* than the handoff estimated. Floating time is the correct reading for a traveller at the destination. Task A6 records this in ADR-0018 so it isn't re-discovered. Open-Meteo *does* return the IANA zone (`timezone=auto` → top-level `timezone` field), so the upgrade path stands if ever wanted. |
| §2.3 Weather >16 days | **Stays closed** — working as designed (ADR-0008/0013). |
| §2.4 Offline link-nav / RSC caching | **Stays closed** — measure before building (ADR-0015). |
| §2.5 Transit coverage holes | **Stays closed** — honest "no route in this data" is correct. |
| §2.6 `nearestStation` unused | **Stays closed** — keep as the available third rung. No action. |
| §2.7 Extension popup untested | **Two-track: Owner checklist** (30-second manual verify) **+ Task A5** (timeboxed Playwright retry — live docs confirm the `chromium` channel supports headless extensions, and the old `spawn UNKNOWN` failure is an OS/AV policy issue on the dev machine, not a Playwright limitation). |
| §2.8 Extension lists owned trips only | **Build — Task A3.** Decision proposed: list accepted-collaborator trips too, app first, extension second — the `OR` predicate already exists in `src/server/auth-scope.ts:47-53`. Recorded in ADR-0018. |
| §2.9 Extension localhost host_permission | **Stays closed** — personal tool; drop only if ever packaged for others. |
| §2.10 MAPBOX_TOKEN save-path not in CI | **Stays closed** — both branches asserted per-environment by design; local `npm run test:e2e` covers the success path. |
| §2.11 Prod smoke-only testing | **Owner checklist** — 5-minute functional pass after next deploy (attachment upload, offline, extension save). |
| §3.1 Attachments not encrypted | **Stays closed** (ADR-0016 §4) — needs its own key-rotation milestone. |
| §3.2 Attachment storage wall | **Build the cheap monitor — Task A4.** Escape hatch (Vercel Blob) unchanged; live check confirms Blob is still free on Hobby and the 30-day lockout still applies. **Correction from live verification:** Neon measures the 0.5 GB cap as "logical data size" in its own console — `pg_database_size` is a local approximation for trend-watching, not the billing truth. The task's script says so in its output. |
| §3.3 No offline map tiles | **Stays closed** — licence limit (ADR-0015 §1). |
| §3.4 Transitous contact not sent | **Stays closed** — knowing deviation, owner-accepted (ADR-0010). |
| §3.5 Per-instance rate limiter | **Stays closed** (ADR-0010, ADR-0001). |
| §3.6 Size-capped Maps not LRUs | **Stays closed** — upgrade only if eviction shows up. |
| §3.7 Duplication is per-row creates | **Stays closed** — upgrade path (`createMany`) recorded in code. |
| §4.1 Groq "not for consumer use" | **Stays open as recorded risk.** Live check 2026-08-20: clause still verbatim in the current Services Agreement (dated 2026-06-22); no clarification published. ADR-0011 stands. No action. |
| §4.2 Groq model-id contradictions | **Stays closed** — runtime listing already handles it (endpoint confirmed still documented). |
| §4.3 OpenRouter free-tier privacy | **Stays closed** (ADR-0011). |
| §4.4 Transitous 1.8 MB payloads | **Stays closed** — keep projecting to compact summaries. |
| §5.1 Skipped features (flights, Gmail, reviews…) | **Stay skipped** — reasoning recorded in research-layer handoff §3/§8. |
| §5.2 Unscheduled (Wikipedia, photos, drag-and-drop) | **Remain unscheduled.** Not in this plan. Drag-and-drop reorder would be a natural M10 follow-up but is not included. |
| §6 sign-out | → Task A2. |
| §6 e2e sign-in helper | → Task A1. |
| §6 database-size check | → Task A4. |
| §6 CACHE_NAME bump discipline | → Global constraint above + explicit step in Task B10. |
| §7 process rule | → Global constraint above; this plan's verification pass already ran. |

## Owner checklist (nothing in code can do these — hand to the project owner)

- [ ] **Set `ENCRYPTION_KEY` in Vercel** (production env). Generate: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Must differ from local `.env`. Without it, saving an AI key in prod `/settings` throws. Rotating later invalidates all stored user keys.
- [ ] **Rotate both OAuth client secrets** (pasted into a chat transcript 2026-08-20). GitHub one is localhost-only — just regenerate. Google one is live: **add the new secret in Google Cloud Console and update Vercel env first, then delete the old** — deleting first breaks prod sign-in.
- [ ] **Hand-verify the extension (30 s):** load `extension/` unpacked at `chrome://extensions`, generate a token in Settings → Browser extension, save any page. If the save fetch fails on CORS, the fix is CORS headers on the two `/api/extension/*` routes only (safe: they're bearer-token-authed, not cookie-authed).
- [ ] **5-minute prod functional pass after the next deploy:** upload an attachment (>1 MB, to exercise Vercel's platform-enforced 4.5 MB body limit), toggle airplane mode on a visited trip page, save a place from the extension against prod.
- [ ] **(Gates M10)** Approve or redirect the design direction in ADR-0019 draft (Task C1) before any M10 task runs.

---

# Milestone M8 — small, high-value closure (Tasks A1–A6)

Branch: `feat/m8-open-items`. One PR.

### Task A1: Extract the shared e2e sign-in helper

Six specs hand-roll the same "create a Session row, set `authjs.session-token`" preamble with **three different cookie shapes**. Canonicalize on the `domain`-based shape (used by `attachments.spec.ts:31-39` / `extension-api.spec.ts:24-32`) — it is equivalent to the `url` form and already the majority among the factored versions.

**Files:**
- Create: `e2e/auth.ts`
- Modify: `e2e/export.spec.ts`, `e2e/places.spec.ts`, `e2e/settings.spec.ts`, `e2e/transit.spec.ts`, `e2e/attachments.spec.ts`, `e2e/extension-api.spec.ts` (replace each inline preamble / local `signIn` with the import)

**Interfaces:**
- Produces: `signInAs(db, context, emailPrefix?) => Promise<{ user, sessionToken }>` — `db` is the spec's existing Prisma client instance, `context` a Playwright `BrowserContext`.

- [ ] **Step 1: Write the helper**

```ts
// e2e/auth.ts
// Canonical e2e sign-in: create a real User + Session row and hand the
// browser the authjs session cookie. Extracted from six specs that each
// hand-rolled this with three different cookie shapes (2026-08-20).
import { randomUUID } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';

export async function signInAs(
  // Prisma client type comes from each spec's existing import; keep this
  // structural so the helper doesn't import the generated client itself.
  db: {
    user: { create: (args: any) => Promise<{ id: string; email: string }> };
    session: { create: (args: any) => Promise<{ sessionToken: string }> };
  },
  context: BrowserContext,
  emailPrefix = 'e2e',
) {
  const user = await db.user.create({
    data: { email: `${emailPrefix}-${randomUUID()}@example.com` },
  });
  const session = await db.session.create({
    data: {
      sessionToken: randomUUID(),
      userId: user.id,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  await context.addCookies([
    {
      name: 'authjs.session-token',
      value: session.sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax' as const,
    },
  ]);
  return { user, sessionToken: session.sessionToken };
}
```

- [ ] **Step 2: Swap it into all six specs.** In each, delete the inline user/session/cookie creation (or the local `signIn` function in `attachments.spec.ts` / `extension-api.spec.ts`) and call `const { user } = await signInAs(db, context, '<existing prefix>');`. Keep each spec's existing email prefix so parallel-run isolation is unchanged. Do **not** touch `sharing.spec.ts`, `offline.spec.ts`, `smoke.spec.ts` — they are not part of this group.
- [ ] **Step 3: Run the suite:** `npm run test:e2e` (local stack up via `docker compose up`). Expected: same pass/skip profile as before the change (the two `MAPBOX_TOKEN` save-success tests skip without a token — that is correct).
- [ ] **Step 4: Commit** — `refactor(e2e): extract shared signInAs helper`.

### Task A2: Sign-out control in a shared authed header

The handoff's "smallest-effort, highest-value item". Adding it must call `caches.delete` directly — the service worker's redirect-based cleanup only fires on the *next* navigation (ADR-0015 §5).

**Files:**
- Create: `src/components/AppHeader.tsx`, `src/components/SignOutButton.tsx`, `src/app/trips/layout.tsx`, `src/app/settings/layout.tsx`, `e2e/signout.spec.ts`

**Interfaces:**
- Consumes: `auth`, `signOut` from `src/auth.ts` (`signOut` is exported and currently never called — verified 2026-08-20).
- Produces: `<AppHeader />` server component rendered above `{children}` on all authed routes. M9/M10 build on this header (skip link target, theme toggle relocation).

- [ ] **Step 1: Write the failing e2e test**

```ts
// e2e/signout.spec.ts
import { test, expect } from '@playwright/test';
// import the same db instance/construction the neighbouring specs use
import { signInAs } from './auth';

test('signed-in user can sign out and loses access', async ({ context, page }) => {
  await signInAs(db, context, 'signout');
  await page.goto('/trips');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('/');
  await page.goto('/trips');
  // proxy.ts guards /trips — an unauthenticated visit must not land on /trips
  await expect(page).not.toHaveURL(/\/trips$/);
});
```

- [ ] **Step 2: Run it — expected FAIL** (no Sign out button exists).
- [ ] **Step 3: Implement**

```tsx
// src/components/SignOutButton.tsx
'use client';

// Clears the offline worker's caches before signing out: the worker's own
// redirect-based cleanup only fires on the NEXT navigation (ADR-0015 §5),
// so a shared machine would keep this user's cached pages until then.
export function SignOutButton({ action }: { action: () => Promise<void> }) {
  return (
    <button
      type="button"
      className="text-sm text-zinc-600 underline dark:text-zinc-400"
      onClick={async () => {
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
        await action();
      }}
    >
      Sign out
    </button>
  );
}
```

```tsx
// src/components/AppHeader.tsx
import { auth, signOut } from '@/auth';
import { SignOutButton } from './SignOutButton';

export async function AppHeader() {
  const session = await auth();
  async function doSignOut() {
    'use server';
    await signOut({ redirectTo: '/' });
  }
  return (
    <header className="w-full border-b border-black/[.08] dark:border-white/[.145]">
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between px-8 py-3">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {session?.user?.email}
        </span>
        <SignOutButton action={doSignOut} />
      </div>
    </header>
  );
}
```

```tsx
// src/app/trips/layout.tsx  (and identically src/app/settings/layout.tsx)
import { AppHeader } from '@/components/AppHeader';

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AppHeader />
      {children}
    </>
  );
}
```

(Header styling deliberately matches the current border idiom; M9/M10 restyle it — don't gold-plate here.)
- [ ] **Step 4: Run the test — expected PASS.** Also `npm run test:e2e` for regressions (the header adds a DOM node above every authed page; check no spec asserted on first-child structure).
- [ ] **Step 5: Commit** — `feat: sign-out control in shared authed header (handoff §2.1)`.

### Task A3: List accepted-collaborator trips (app first, extension second)

Handoff §2.8. The predicate already exists at `src/server/auth-scope.ts:47-53`; `listTrips` (`src/server/trips.ts:46-52`) and `listTripsForExtension` (`src/server/extensionApi.ts:34`, a deliberate mirror) just don't use it.

**Files:**
- Modify: `src/server/trips.ts:46-52`, `src/server/extensionApi.ts` (`listTripsForExtension` — signature gains `email`), `src/app/api/extension/trips/route.ts` (pass `identity.email`)
- Test: `e2e/sharing.spec.ts` (or a new focused spec if fitting it in is awkward)

**Interfaces:**
- Produces: `listTrips(): Promise<Trip[]>` now returns owned + accepted-collaborator trips, same ordering. `listTripsForExtension(userId: string, email: string)` likewise.

- [ ] **Step 1: Write the failing e2e test** (direct DB setup — don't depend on the invite flow):

```ts
test('accepted collaborator sees the shared trip on /trips', async ({ context, page }) => {
  const { user: owner } = await signInAs(db, context, 'share-owner'); // creates owner
  const trip = await db.trip.create({
    data: { userId: owner.id, name: 'Kyoto', destinations: 'Kyoto',
            startDate: new Date('2026-10-01'), endDate: new Date('2026-10-05'),
            baseCurrency: 'JPY' }, // match required fields from prisma/schema.prisma
  });
  const collabContext = await browser.newContext();
  const collabPage = await collabContext.newPage();
  const { user: collab } = await signInAs(db, collabContext, 'share-collab');
  await db.tripCollaborator.create({
    data: { tripId: trip.id, email: collab.email, status: 'ACCEPTED' },
    // field names: mirror exactly what src/server/auth-scope.ts:47-53 queries
  });
  await collabPage.goto('/trips');
  await expect(collabPage.getByText('Kyoto')).toBeVisible();
});
```

- [ ] **Step 2: Run — expected FAIL** (trip absent from collaborator's list).
- [ ] **Step 3: Implement.** Mirror the exact `OR` shape from `auth-scope.ts:47-53`:

```ts
// src/server/trips.ts — listTrips
export async function listTrips() {
  const userId = await currentUserId();
  const user = await db.user.findUniqueOrThrow({
    where: { id: userId },
    select: { email: true },
  });
  return db.trip.findMany({
    where: {
      OR: [
        { userId },
        { collaborators: { some: { email: user.email, status: 'ACCEPTED' } } },
      ],
    },
    orderBy: { startDate: 'desc' },
  });
}
```

Apply the same `where` in `listTripsForExtension(userId, email)` (it already receives identity from the bearer token — add `email` to the signature and pass `identity.email` at the call site in `src/app/api/extension/trips/route.ts`). Update its "mirrors listTrips" comment to stay true.
- [ ] **Step 4: Run the new test — PASS.** Run `e2e/extension-api.spec.ts` — its cross-user-isolation tests must still pass (a *non*-collaborator still sees nothing; if one of those tests set up a collaborator row, re-read it carefully before changing anything).
- [ ] **Step 5: Commit** — `feat: shared trips appear in trip lists (handoff §2.8, ADR-0018)`.

### Task A4: Database-size check

Handoff §3.2/§6. **Correction from the live pass:** Neon's 0.5 GB cap is measured as "logical data size" in Neon's own console — `pg_database_size` is an approximation for trend-watching. Cheap script, honest output.

**Files:**
- Create: `scripts/db-size.cjs`
- Modify: `package.json` (add script)

- [ ] **Step 1: Write the script**

```js
// scripts/db-size.cjs
// Trend check against Neon's 0.5 GB free-plan cap (handoff §3.2).
// ponytail: pg_database_size is an approximation — Neon bills on its own
// "logical data size" metric; the Neon console is the authoritative number.
const { PrismaClient } = require('../src/generated/prisma'); // match src/server/db's import path
const db = new PrismaClient();

db.$queryRaw`SELECT pg_database_size(current_database()) AS bytes`
  .then(([row]) => {
    const mb = Number(row.bytes) / (1024 * 1024);
    const pct = ((mb / 512) * 100).toFixed(1);
    console.log(`${mb.toFixed(1)} MB (~${pct}% of Neon's 0.5 GB free cap — approximate; Neon console is authoritative)`);
    if (mb > 384) console.warn('WARNING: past 75% — plan the Vercel Blob migration (ADR-0016 §1) before the wall.');
  })
  .finally(() => db.$disconnect());
```

- [ ] **Step 2:** `package.json` scripts: `"db:size": "node scripts/db-size.cjs"`. Usage against prod: run with `DATABASE_URL` set to the Neon URL.
- [ ] **Step 3: Verify locally:** `npm run db:size` against the docker-compose DB. Expected: a MB figure prints, exit 0.
- [ ] **Step 4: Commit** — `chore: db-size trend check against Neon cap (handoff §3.2)`.

### Task A5: Playwright extension-popup spec — timeboxed retry

Handoff §2.7. Live verification found: (a) Playwright's current docs support MV3 extensions headless **via the `chromium` channel** with `launchPersistentContext` + `--load-extension`/`--disable-extensions-except`, reading the extension id from the service worker URL; (b) the old `spawn UNKNOWN` on this machine matches [playwright#35363](https://github.com/microsoft/playwright/issues/35363) — OS policy/AV blocking executables under the `ms-playwright` browser cache, not a Playwright defect.

**Timebox: 2 hours.** If it doesn't run on this machine inside the box, stop, keep the manual owner verify as the control, and record the attempt's outcome in the PR description. Do not let this task eat the milestone.

- [ ] **Step 1:** Recover the removed spec: `git log --all --oneline -- e2e/*extension*` then `git show <sha>:<path>` for the deleted popup spec (the handoff says it was close to working).
- [ ] **Step 2:** Whitelist the Playwright cache dir in Defender (owner may need to do this): Windows Security → Exclusions → add `%USERPROFILE%\AppData\Local\ms-playwright`.
- [ ] **Step 3:** Fixture per current Playwright docs — `chromium.launchPersistentContext('', { channel: 'chromium', args: ['--disable-extensions-except=<abs extension/ path>', '--load-extension=<abs extension/ path>'] })`; get the id via `context.serviceWorkers()[0].url().split('/')[2]` (wait for the `serviceworker` event if empty — note this extension has no background SW, so if no service worker appears, open `chrome-extension://<id>/popup.html` by deriving the id from a probe; if id derivation is the blocker again, that's a legitimate timebox exit).
- [ ] **Step 4:** The one assertion that matters: from the popup page, a `fetch` against `http://localhost:3000/api/extension/trips` with a valid token succeeds — proving `host_permissions` grants the CORS bypass (live docs confirm extension pages are CORS-exempt for declared hosts).
- [ ] **Step 5:** If green: keep it out of CI (CI has the headless shell, not full Chromium; the pipeline has already had a hanging Playwright install). Gate with `test.skip(!!process.env.CI, 'needs full chromium + local machine')`. Commit — `test(e2e): extension popup fetch under host_permissions (handoff §2.7)`.

### Task A6: ADR-0018 — record this milestone's decisions

**Files:** Create: `docs/adr/0018-shared-trips-listing-and-phase-4-dispositions.md`

- [ ] **Step 1:** Write the ADR covering: (1) trip lists include accepted-collaborator trips (app and extension together, same predicate as `requireTripAccessForUser` — one authorization idiom, now three call sites); (2) ICS stays floating-local-time — re-confirmed 2026-08-20 with the RFC 5545 VTIMEZONE finding and the recorded upgrade path (Open-Meteo `timezone=auto` → `Trip.timezone` migration → TZID + VTIMEZONE emission — a milestone, not a tweak); (3) db-size monitoring is a trend script, Neon console authoritative. Follow the existing ADR file format (read `docs/adr/0017-*.md` first).
- [ ] **Step 2:** Commit — `docs: ADR-0018 (shared trips listing; ICS timezone stays closed)`.
- [ ] **Milestone close:** repo-wide checks (`npm run lint && npm run format && npm run test && npm run test:e2e`), PR `Phase 4 M8 — open-items closure`.

---

# Milestone M9 — UI compliance pass (Tasks B1–B11)

Branch: `feat/m9-ui-compliance`. One PR. This milestone fixes what all three audits agree on: **it does not restyle the app** (that's M10). Order matters — B1's primitives make B2–B9 mechanical.

### Task B1: Global CSS foundations (one file, four repo-wide fixes)

**Files:** Modify: `src/app/globals.css`

- [ ] **Step 1:** Fix the dead fonts: in the `body` rule, replace `font-family: Arial, Helvetica, sans-serif;` with `font-family: var(--font-sans);` — Geist is already loaded and wired into `@theme inline` (`globals.css:19-20`); this one line makes it actually render.
- [ ] **Step 2:** Add `color-scheme` (fixes light scrollbars + light-chrome date/time pickers in dark mode):

```css
:root { color-scheme: light; }
.dark { color-scheme: dark; }
```

- [ ] **Step 3:** Add a global focus indicator (all three audits: **zero** `focus-visible` styles exist; UA default is invisible on the black pill buttons):

```css
:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible {
  outline: 2px solid #2563eb;
  outline-offset: 2px;
}
```

(`#2563eb` is already the app's declared theme colour in `manifest.ts:21` and `layout.tsx:58`.)
- [ ] **Step 4:** Add gentle motion + numeric alignment utilities:

```css
button, a, summary { transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease; }
@media (prefers-reduced-motion: reduce) {
  button, a, summary { transition: none; }
}
```

- [ ] **Step 5:** Visual smoke: `npm run dev`, check /trips light+dark — Geist renders (letterforms change), tab key shows a visible ring on every control, date inputs in dark mode get dark chrome.
- [ ] **Step 6: Commit** — `fix(ui): render loaded fonts, color-scheme, global focus ring, reduced-motion-safe transitions`.

### Task B2: `SubmitButton` + `ConfirmSubmitButton` primitives

**Files:** Create: `src/components/SubmitButton.tsx`, `src/components/ConfirmSubmitButton.tsx`

**Interfaces:**
- Produces: `<SubmitButton pendingLabel="Saving…">Save</SubmitButton>` — `useFormStatus`-driven pending state, drop-in inside any `<form>`. `<ConfirmSubmitButton confirm="Delete this trip and everything in it?">Delete trip</ConfirmSubmitButton>` — same, plus `window.confirm` gate (the pattern already proven at `AiKeyPanel.tsx:210-216`; `ponytail:` a `<dialog>` upgrade exists if ever wanted).

- [ ] **Step 1: Implement**

```tsx
// src/components/SubmitButton.tsx
'use client';
import { useFormStatus } from 'react-dom';

export function SubmitButton({
  children, pendingLabel, className,
}: { children: React.ReactNode; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
```

```tsx
// src/components/ConfirmSubmitButton.tsx
'use client';
import { useFormStatus } from 'react-dom';

// ponytail: window.confirm, not <dialog> — matches AiKeyPanel's proven
// pattern; upgrade to a styled dialog if design ever needs it.
export function ConfirmSubmitButton({
  children, confirm, pendingLabel, className,
}: { children: React.ReactNode; confirm: string; pendingLabel: string; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit" disabled={pending} aria-busy={pending} className={className}
      onClick={(e) => { if (!window.confirm(confirm)) e.preventDefault(); }}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}
```

- [ ] **Step 2:** Unit-smoke via one e2e interaction later (B3/B4 cover them in situ). Commit — `feat(ui): SubmitButton and ConfirmSubmitButton primitives`.

### Task B3: Confirmation sweep — 11 destructive actions

All three audits, top finding. Swap the bare submit button for `ConfirmSubmitButton` at every site; wording states what is lost.

- [ ] **Step 1:** Apply at each site (confirm strings shown; keep each site's existing classes):
  - `src/app/trips/[id]/edit/page.tsx:71-79` — "Delete this trip and all its days, activities, expenses and attachments? This cannot be undone." / pending "Deleting…"
  - `src/app/trips/[id]/ItineraryDays.tsx:301-314` — "Delete this activity?"
  - `src/app/trips/[id]/BudgetPanel.tsx:89-94` — "Delete this expense?"
  - `src/app/trips/[id]/places/PlaceRow.tsx:171-178` — "Delete this saved place?"
  - `src/app/trips/[id]/Attachments.tsx:76-81` — "Delete this file? It cannot be recovered."
  - `src/app/trips/[id]/Checklist.tsx:74-79` — "Delete this checklist item?"
  - `src/app/trips/[id]/SharingPanel.tsx:104-109` — "Remove this collaborator? They lose access immediately." (also add `aria-label={`Remove ${collaborator.email}`}` — N identical "Remove" links otherwise)
  - `src/app/trips/[id]/SharingPanel.tsx:54-61` — "Turn off the public link? Anyone holding it loses access."
  - `src/app/trips/[id]/SharingPanel.tsx:46-53` (Regenerate) — "Regenerate the link? Every previously shared link stops working."
  - `src/app/settings/ExtensionTokenPanel.tsx:74-83` (Revoke) — "Revoke the token? Every installed extension disconnects." — and the Generate-new path at `:60-72` when a token already exists: "Replace the existing token? The old one stops working."
  - `extension/popup.js:161-164` (Disconnect) — plain `if (!confirm('Disconnect from Trip Planner?')) return;` (vanilla JS surface).
- [ ] **Step 2:** e2e: `npm run test:e2e` — specs that click Delete now hit a native confirm; Playwright auto-dismisses dialogs by default, so add `page.on('dialog', d => d.accept())` in affected specs (grep for the delete interactions).
- [ ] **Step 3: Commit** — `fix(ui): confirmation on all 11 destructive actions`.

### Task B4: Pending-state sweep — bare mutation forms

- [ ] **Step 1:** Swap the plain `<button type="submit">` for `SubmitButton` (labels per site: "Saving…", "Adding…", "Duplicating…", "Voting…" etc.) in every bare `<form action={...}>` listed by the audit: `ItineraryDays.tsx:183-205` (vote), `:219-256` (pin colours), `:261-294` (move up/down), `Checklist.tsx:40-61`, `Attachments.tsx` upload form (`:88-123`), `SharingPanel.tsx:46-72,97-110,128-134` ("Inviting…"), `BudgetPanel.tsx:86-95`, `PlaceRow.tsx:78-99` ("Add to day"), `trips/page.tsx:86-96` (Duplicate — slow op, the worst offender), `InvitesBanner.tsx:19-34`, `AiKeyPanel.tsx:139-146` (Retry), `SharedTripView.tsx:61-70` (Save a copy). Sites already converted in B3 are done — `ConfirmSubmitButton` includes pending handling.
- [ ] **Step 2:** Extension popup: `extension/popup.js:111-127` and `:136-155` — set `btn.textContent = 'Connecting…' / 'Saving…'` on start, restore in `finally`. Wrap both popup sections in real `<form>` elements (`popup.html:9-46`), primary buttons `type="submit"`, bind `submit` + `preventDefault` — makes Enter work.
- [ ] **Step 3: Commit** — `fix(ui): pending state on every mutation; extension popup forms submit on Enter`.

### Task B5: Label sweep — every form control gets an accessible name

Copy the proven pattern from `TripForm.tsx:46-56` (`<label className="flex flex-col gap-1"><span>…</span><input/></label>`; `sr-only` on the span where a visible label doesn't fit). Placeholders stay as *examples* only.

- [ ] **Step 1:** Apply at: `ActivityForm.tsx:52-118` (7 fields — the two `type="time"` inputs get visible "Start" / "End" labels, they're indistinguishable otherwise; the category `<select>` at `:59-69` gets a label), `ExpenseForm.tsx:26-53` (4), `Checklist.tsx:93-98`, `DayNotesForm.tsx:36-41` (also add `rows={3}`), `PlaceRow.tsx:82-92` (day select) and `:127-156` (3 fields), `SharingPanel.tsx:121-127` (email — plus `autoComplete="email"`, `inputMode="email"`, `spellCheck={false}`), `Attachments.tsx:95-101` (file input), `ExtensionTokenPanel.tsx:38-45` (token — plus `translate="no"`, `spellCheck={false}`), `places/page.tsx:285-303` (search → `type="search"` + sr-only label; category select + label).
- [ ] **Step 2:** While in each file: currency-code inputs (`TripForm.tsx:102-109`, `ActivityForm.tsx:104-110`, `ExpenseForm.tsx:47-53`, `PlaceRow.tsx` currency) get `spellCheck={false} autoCapitalize="characters"`; amount fields get `inputMode="decimal"`; `autoComplete="off"` on non-auth text fields.
- [ ] **Step 3:** e2e: `npm run test:e2e` — update any selector that targeted by placeholder.
- [ ] **Step 4: Commit** — `fix(a11y): real labels on every form control`.

### Task B6: Async announcements + map accessibility

- [ ] **Step 1:** `aria-live` wraps (four one-line changes + the token panel): `TransitLeg.tsx:88-164` → wrap results region in `<div aria-live="polite" aria-busy={isPending}>`; same for `GuideSummary.tsx:44-53`, `DayPlanner.tsx:135-173`, and — highest stakes — `ExtensionTokenPanel.tsx:33-50` (token shown exactly once).
- [ ] **Step 2:** Map pins (`src/components/Map.tsx:83-92`): `document.createElement('button')`, `el.type = 'button'`, `el.setAttribute('aria-label', pin.title)`, size ≥24px with padded hit area. Container (`:143`): `role="region" aria-label="Map of itinerary places"` + `overflow-hidden` (the canvas paints over `rounded-lg`). `flyTo` (`:121`): `{ duration: matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : undefined }`. Missing-token case (`:65`): render the same styled fallback used at `:126-141` instead of a silent grey box.
- [ ] **Step 3:** Vote button (`ItineraryDays.tsx:190-204`): `aria-pressed={mine}`, `aria-label={`${count} votes${mine ? ', you voted' : ''} — ${title}`}`, `<span aria-hidden>👍</span>`; drop the `title`-only tooltip.
- [ ] **Step 4: Commit** — `fix(a11y): live regions for async results; keyboard-accessible map pins`.

### Task B7: Touch targets + contrast

- [ ] **Step 1:** Targets to ≥24px (44px where cheap): move up/down arrows `ItineraryDays.tsx:269-294` → add `p-2`, keep glyphs; pin-colour summary `:207-217` and swatches `:229-238` → `h-6 w-6` minimum with `gap-2`; vote button `:197` → `py-1.5`; checklist toggle `Checklist.tsx:49-70` → make it one hit target: real `<input type="checkbox">` inside a `<label>` wrapping the text (keeps `aria-pressed` semantics for free).
- [ ] **Step 2:** Contrast substitutions (both audits computed the same failures): light mode `text-amber-600` → `text-amber-700` at `places/page.tsx:78,108,112,117`, `BudgetPanel.tsx:59-68`, `SharedTripView.tsx:90-100`, `AiKeyPanel.tsx:135`, `DayPlanner.tsx:141-152`; `text-green-600` → `text-green-700` (`places/page.tsx:105-113`); `text-zinc-400` → `text-zinc-500`, and dark `dark:text-zinc-600` → `dark:text-zinc-400` at `ItineraryDays.tsx:369`, `Checklist.tsx:65`; `dark:text-zinc-500` → `dark:text-zinc-400` at `ItineraryDays.tsx:117`, `DayPlanner.tsx:203`. Dark card borders: `dark:border-white/[.145]` → `dark:border-white/25` repo-wide (find-replace; ~40 sites).
- [ ] **Step 3: Commit** — `fix(a11y): WCAG target sizes and AA contrast`.

### Task B8: Dark-mode stragglers + print button

- [ ] **Step 1:** The documented-twice select bug, three missed sites: copy the exact `bg-white … dark:bg-zinc-900` select+`<option>` treatment from `DayPlanner.tsx:87-108` to `ActivityForm.tsx:59-69`, `PlaceRow.tsx:82-92`, `places/page.tsx:292-303`. Then extract `src/components/Select.tsx` wrapping that treatment and use it at all now-seven sites so it can't regress an eighth time.
- [ ] **Step 2:** Print page: `print/ExportButton.tsx:8` uses `bg-foreground text-background` on a forced-light page → invisible for dark-theme users (1.17:1). Hardcode: `bg-zinc-900 text-white hover:bg-zinc-700`.
- [ ] **Step 3:** Pin-colour popover `ItineraryDays.tsx:218` uses `bg-background` (`#0a0a0a`) on `dark:bg-black` pages → invisible. Give it `dark:bg-zinc-900` (with the B7 border it now reads).
- [ ] **Step 4: Commit** — `fix(ui): dark-mode select/popover/print-button regressions; shared Select`.

### Task B9: Loading, error, and not-found routes

Zero `loading.tsx`/`error.tsx`/`not-found.tsx` exist; `/trips/[id]/places` can block on a blank screen for up to 60 s (`maxDuration = 60`).

- [ ] **Step 1:** `src/app/trips/[id]/loading.tsx` and `src/app/trips/[id]/places/loading.tsx` — skeletons matching the real card layout (fixed heights, `animate-pulse` on `bg-zinc-200 dark:bg-zinc-800` blocks sized to the page shell `max-w-3xl px-8 py-16`), so no layout shift.
- [ ] **Step 2:** Stream the slow non-essentials: in `trips/[id]/page.tsx:55-63`, move the `geocode()` + `getTripWeather()` awaits into a child async component wrapped in `<Suspense fallback={<MapSkeleton/>}>`; in `places/page.tsx`, wrap `getGuide` the same way. The itinerary must render before the network calls resolve.
- [ ] **Step 3:** `src/app/error.tsx` (client component: message + "Try again" via `reset()` + link to `/trips`) and `src/app/not-found.tsx` (heading + link to `/trips`). Replace the five hand-rolled `ForbiddenOrNotFoundError` bare-`<p>` fallbacks (`trips/[id]/page.tsx:42-48`, `places/page.tsx:204-209`, `edit/page.tsx:32-38`, `activities/[activityId]/edit/page.tsx:24-31`, `shared/[token]/page.tsx:44-52,66-74`) with `notFound()` calls where semantics fit, or at minimum add a heading + "Back to trips" link to each.
- [ ] **Step 4:** Search pending state: `places/page.tsx:284-310` GET form gets a `SubmitButton pendingLabel="Searching…"`.
- [ ] **Step 5: Commit** — `feat(ui): loading skeletons, streamed slow data, error/not-found routes`.

### Task B10: Layout shell — skip link, landmarks, safe areas, PWA polish

- [ ] **Step 1:** `layout.tsx:78-82`: add skip link as first body child — `<a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2 dark:focus:bg-zinc-900">Skip to content</a>`; add `id="main"` to every page's `<main>`.
- [ ] **Step 2:** Safe areas + overlays: `ThemeToggle.tsx:76` → move it into `AppHeader` (from A2) and drop the fixed positioning entirely (fixes the overlap-with-content and z-index issues in one move); `OfflineReady.tsx:36-44` → `sticky top-0` (pushes content instead of covering it) + `pt-[env(safe-area-inset-top)]`; keep `role="status"` — and keep the node in the tree, toggling only text (same rule applies to `extension/popup.html:43-44`'s `hidden` status nodes).
- [ ] **Step 3:** `layout.tsx:55-59` viewport: media-split theme colour — `themeColor: [{ media: '(prefers-color-scheme: light)', color: '#ffffff' }, { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' }]`. Add `<link rel="preconnect" href="https://api.mapbox.com" />`.
- [ ] **Step 4:** iOS icon: generate `src/app/apple-icon.png` (180×180) from `public/icon-512.png` (`npx --yes sharp-cli resize 180 180 -i public/icon-512.png -o src/app/apple-icon.png`). Delete unused starter SVGs in `public/` (`next.svg`, `vercel.svg`, `file.svg`, `globe.svg`, `window.svg`).
- [ ] **Step 5:** **Bump `CACHE_NAME`** in `public/sw.js:28` → `'trip-planner-v2'` (this milestone changed the root layout).
- [ ] **Step 6: Commit** — `feat(ui): skip link, landmark shell, safe areas, PWA polish; bump CACHE_NAME`.

### Task B11: Responsive pass — make the PWA usable on a phone

One breakpoint exists in the whole app (`page.tsx:54`). Minimum viable mobile pass; verify each at 375px via Playwright viewport or browser devtools.

- [ ] **Step 1:** Page shells: `px-8 py-16` → `px-4 py-8 sm:px-8 sm:py-16` at `trips/page.tsx:29-30`, `trips/[id]/page.tsx:66-67`, `places/page.tsx:250`, `settings/page.tsx:22-23`, `SharedTripView.tsx:52-53`, `page.tsx:31-32`.
- [ ] **Step 2:** Header rows get `flex-wrap gap-y-2`: `trips/page.tsx:33-51`, `trips/[id]/page.tsx:72-97` (wrap the four links in `<nav aria-label="Trip actions">` while there).
- [ ] **Step 3:** Row components stack on narrow screens (`flex-col sm:flex-row sm:items-center`): `ItineraryDays.tsx:139` (activity row — action cluster drops below content), `PlaceRow.tsx:51-100`, `places/page.tsx:320-347` (also add `min-w-0` + `truncate` guards on OSM-sourced names). `Attachments.tsx:53-58`: `block min-w-0 flex-1 truncate` (the current `truncate` is inert on the inline `<a>`).
- [ ] **Step 4:** `SharingPanel.tsx:115-127`: error `<p>` gets `w-full` (currently squashed into the flex row — the fix `ExpenseForm.tsx:19-22` already uses). Share URL gets a copy button (`navigator.clipboard.writeText` + "Copied" state), reusing the token panel's readOnly-input idiom.
- [ ] **Step 5:** e2e smoke at mobile viewport: add one spec (or a projects entry) running the trips list + trip detail at `viewport: { width: 375, height: 812 }` asserting no horizontal scroll (`document.documentElement.scrollWidth <= 375`).
- [ ] **Step 6: Commit** — `fix(ui): responsive pass for mobile PWA`.
- [ ] **Milestone close:** full repo-wide checks, PR `Phase 4 M9 — UI compliance pass`. Include before/after screenshots (light/dark, desktop/375px) in the PR body.

---

# Milestone M10 — design elevation (OWNER-APPROVAL-GATED, Tasks C1–C7)

The frontend-design audit's verdict: the app is visually the unmodified `create-next-app` starter (its border/button/hover idioms are pasted across 23 files) and proposes a **"departure board / rail timetable"** direction — dense, tabular numerals, day-boundary rules, one saturated accent used for now/next/selected. This is an aesthetic commitment the owner must approve first. **Do not start C2–C7 until C1's ADR is approved.**

### Task C1: ADR-0019 — design direction (STOP for owner approval)

- [ ] Write `docs/adr/0019-visual-design-direction.md` proposing: warm-neutral ink/paper palette; accent = the existing `#2563eb` blue family (already declared in `manifest.ts:21`, `layout.tsx:58`, `Map.tsx:25`, `extension/popup.css:42` — one accent, four sites reconciled, zero new colours invented); semantic token set (`--surface`, `--surface-raised`, `--border`, `--accent`, `--warning`, `--positive`, `--danger` + `-fg` pairs, dark values on `.dark`); 6-step type scale (36/24/18/15/13/11) with Geist Mono + `tabular-nums` for all money/times/dates; departure-board treatment for itinerary and budget. Alternatives section: (a) keep the quiet greyscale but tokenized, (b) the ui-ux-pro-max skill's teal/orange travel palette. **Halt and get explicit owner approval on the direction before proceeding.**

### Task C2: Token system + template-fingerprint purge

- [ ] Replace `globals.css:11-32` token block with the approved semantic set; sweep all 23 files replacing `border-black/[.08] dark:border-white/25` → `border-border`, the 24 `hover:bg-[#383838] dark:hover:bg-[#ccc]` → token-based hover, `bg-foreground text-background` pills → the approved button recipe. Extract `src/components/Card.tsx` for the universal `rounded-lg border p-5` container. Unify the dark ground: pages `dark:bg-zinc-950`, cards/popovers `dark:bg-zinc-900` (replaces the `dark:bg-black` × `--background:#0a0a0a` mismatch). Commit per sweep chunk; run repo checks mid-task.

### Task C3: Type scale + tabular numerals

- [ ] Apply the approved scale: page titles up from `text-2xl`; section headings visibly larger than body (today they differ only by weight); `font-mono tabular-nums` on every `formatMoney`/time/date output (`BudgetPanel`, `ItineraryDays`, `SharedTripView.tsx:104-111`, `print/page.tsx:110-127`, `ExpenseForm`). Consolidate the duplicated formatters while touching them: `formatDateRange` (`trips/page.tsx:13-20` = `print/page.tsx:30-37`) and `formatDay` (`print/page.tsx:19-28` = `SharedTripView.tsx:15-24`) into `src/lib/format.ts`; drop the hardcoded `'en-US'` locale arguments (8 sites) in the same pass — pass `undefined` for user locale, keeping the UTC-pinning options exactly as they are (`AiKeyPanel.tsx:129-130` also needs this to fix its SSR/client hydration mismatch).

### Task C4: Budget panel redesign

- [ ] `BudgetPanel.tsx:31-101`: stacked proportion bar of category shares; over/under figure as the largest type on the panel; right-aligned tabular columns; keep integer-minor-unit math untouched — this is presentation only. Mirror the treatment (statically) in `print/page.tsx:107-116` and `SharedTripView.tsx:102-113`.

### Task C5: Itinerary day rail + two-pane trip detail

- [ ] The signature element: vertical timeline down `ItineraryDays.tsx` — each day a "station stop" showing date, the already-fetched weather, day cost subtotal, activity count. At `lg:`, `trips/[id]/page.tsx` becomes two-pane: itinerary left, sticky map right (`Map.tsx:143` grows beyond `h-80`); single column below `lg:` unchanged. Replace `👍`/`↑`/`↓` glyphs with a small inline-SVG set (three icons, hand-written or Lucide-copied — no new dependency) sized to the B7 hit areas.

### Task C6: Shared view + trip list identity

- [ ] `SharedTripView.tsx:51-71`: cover header (trip name, date range, destination + day counts), then itinerary, then a quiet "Planned with Trip Planner" footer linking to `/`. Continue stripping owner/token fields in `src/server/sharing.ts` only — no new data exposure. `trips/page.tsx:66-99`: trip rows become cards with day count, days-until-departure, destinations — data already on the model; no images, no new fetches.

### Task C7: Print stylesheet + extension re-cut

- [ ] Real `@media print` block in `globals.css`: `@page { margin: 18mm 16mm; }`, 10.5pt body, running trip-name header, page counters, borders → horizontal rules (remove the per-activity boxes at `print/page.tsx:144`), `print-color-adjust: exact` where backgrounds carry meaning, `break-after: avoid` on day headings. Re-cut `extension/popup.css` (67 lines) from the approved tokens: same accent, radius, type stack; fix its dark-mode borders (`light-dark(rgb(0 0 0 / .2), rgb(255 255 255 / .25))`), 12px label floor, hover + focus-visible states, `<h1>` on the save view, `<option>Loading trips…</option>` seed. **Bump `CACHE_NAME`** again if layout.tsx changed this milestone.
- [ ] **Milestone close:** repo checks, PR `Phase 4 M10 — design elevation` with screenshots.

---

# Execution notes for the implementing agent

1. **Read first:** `CLAUDE.md`, `docs/phase-3-open-items-handoff.md`, `docs/adr/0015`–`0017`, this plan's Part 0. The audit evidence behind M9/M10 is summarized in the task text — file:line references were verified against `main` @ `bb18eac` on 2026-08-20; re-grep before editing if the tree has moved.
2. **Process:** superpowers:subagent-driven-development per task; superpowers:verification-before-completion before any "done" claim; repo-wide checks every 3–4 tasks; one PR per milestone; never deploy manually (ADR-0002).
3. **Hard stops:** the Owner checklist items are not yours to do. Task C1 ends with a halt for approval. Task A5 has a 2-hour timebox — respect it.
4. **Don't re-litigate** anything marked "stays closed" in Part 0 — each has an ADR or recorded reasoning; the handoff doc explains why re-proposing them wastes a session.
