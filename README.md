# Trip Planner

A multi-user trip planner for longer, multi-city trips (Japan and Europe were the driving
use cases): a day-by-day itinerary, a budget that handles spending in several currencies at
once, and a map that stays in sync with the plan.

**Status: working app, actively in development.** Phase 1 is functional end-to-end. Phase 2
(trip sharing and itinerary export) is specced and planned, not yet built.

## Seeing it

There's no public demo link, deliberately. The app sits behind Google/GitHub sign-in and
there's no logged-out landing page yet, so a demo URL would show you a sign-in redirect and
nothing else. Run it locally instead — see [Running it](#running-it) below.

## What works today

- **Trips** — create, edit, and delete a trip with destinations, date range, a base currency,
  and a total budget.
- **Itinerary** — every date in the range gets a day; activities carry a title, place,
  category, start/end time, notes, cost, and explicit ordering within the day.
- **Multi-currency budget** — log an activity cost or a standalone expense (flights, hotels)
  in whatever currency you actually paid in. The budget panel converts everything into the
  trip's base currency and rolls it up against the budget.
- **Maps** — activity place names are geocoded server-side on create and update, and the
  Mapbox map view stays in sync in both directions: click an activity in the itinerary and
  the map flies to its pin, click a pin and the activity highlights in the list.
- **Auth** — Auth.js v5 with Google and GitHub, database-backed sessions.

## Decisions worth reading

The reasoning lives in [`docs/adr/`](docs/adr/). The ones that shaped the code most:

- **[ADR-0001](docs/adr/0001-deploy-vercel-neon-defer-aws.md) — Vercel + Neon, AWS deferred.**
  The original scope assumed ECS Fargate + RDS at ~$40–70/month. Against a $0/month
  constraint, that infra buys almost nothing a live URL and green CI don't already
  demonstrate, so Terraform/ECS/RDS became an optional post-ship milestone.
- **[ADR-0002](docs/adr/0002-gated-deploys-via-actions.md) — production deploys only through
  CI.** Vercel's git-push auto-deploy is switched off in `vercel.json`; the only path to
  production is the Actions pipeline, after the full quality gate passes.
- **[ADR-0003](docs/adr/0003-optimistic-locking.md) — optimistic locking from day one.**
  Every mutable model carries `updatedAt`; mutations send the client's last-seen value and
  the write is rejected if it's stale. Phase 1 is single-owner so conflicts are currently
  impossible — the point is that concurrency control is cheap to add now and error-prone to
  retrofit onto every mutation once sharing lands.
- **[ADR-0005](docs/adr/0005-additive-day-generation.md) — day generation never deletes.**
  `Day` cascades to `Activity`, so regenerating a trip's days from its current date range
  would silently destroy activities if the user shortened the trip. Generation is
  additive-only and idempotent.
- **[ADR-0006](docs/adr/0006-collaborator-matched-by-email.md) — Collaborators are matched by
  email, not a `User` foreign key.** Phase 2 sharing invites by email before the invitee
  necessarily has an account; every access check matches the signed-in session's verified
  OAuth email against the invite, so there's no resolve-on-login step and no orphaned
  pre-signup state.
- **[ADR-0007](docs/adr/0007-export-via-browser-print.md) — export is browser print-to-PDF,
  not a server-generated file.** Headless-Chrome PDF generation doesn't fit Vercel serverless
  without breaking the $0/month constraint (ADR-0001), so export is a print-styled page and
  the browser's own print-to-PDF.

Two rules the code holds to throughout:

- **Money is never a float.** Integer minor units plus an ISO 4217 currency code, converted
  only on read (`src/lib/money.ts`, `src/lib/fx.ts`).
- **Nested resources are never addressed by their own id alone.** Days, activities, and
  expenses are always reached through an ownership check on their trip (`src/server/auth-scope.ts`).

## Stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind 4 · Prisma 7 · PostgreSQL ·
Auth.js v5 · Mapbox GL · Vitest · Playwright.

Postgres runs in Docker locally and on Neon in production. FX rates come from
exchangerate-api.com, refreshed server-side once a day so the key never reaches the browser.

## Tests and CI

The quality gate in [`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs `tsc --noEmit`,
ESLint, a Prettier check, a generated-file-map check, `prisma migrate deploy`, the Vitest
suite, and Playwright end-to-end tests. Deployment is a separate job gated behind it.

The `*.db.test.ts` suites run against a real Postgres instance rather than a mocked Prisma
client — budget roll-up across currencies and activity geocoding are the kind of thing where
a mock would happily agree with a bug.

## Running it

```bash
cp .env.example .env    # fill in AUTH_*, MAPBOX_TOKEN, EXCHANGE_RATE_API_KEY
docker compose up       # app on :3000, Postgres on :5432
```

Then apply migrations and, optionally, seed:

```bash
npx prisma migrate dev
npm run db:seed
```

To run the app natively against the same database, use `npm run dev` instead of the `app`
service. Other scripts: `npm run test`, `npm run test:e2e`, `npm run lint`, `npm run format`.

Auth needs real OAuth credentials — sign-in will not work with an empty `.env`. `.env.example`
lists every required variable and which ones are safe to expose to the browser.

## What's not done

- **Phase 2: trip sharing and itinerary export.** Designed and planned, not implemented:
  [design spec](docs/superpowers/specs/2026-08-11-phase2-sharing-export-design.md),
  [sharing implementation plan](docs/superpowers/plans/2026-08-11-phase2-sharing.md), and
  [export implementation plan](docs/superpowers/plans/2026-08-11-phase2-export.md). Sharing
  adds a public read-only link and named Collaborators (invite by email, accept/decline, full
  edit rights once accepted); export is a print-styled page using the browser's native
  print-to-PDF (ADR-0007). Optimistic locking is already in place for it (ADR-0003).
- **No logged-out landing page**, which is why there's no demo link above.
- **AWS/Terraform infrastructure** — deferred, not abandoned; see ADR-0001.
- **FX rates are daily, not historical.** An expense is converted at the current day's rate,
  not the rate on the date it was incurred.
