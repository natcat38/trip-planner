# Japan/Europe Trip Planner — Tech Scope

> **Audience:** engineers (you, building it). Code-level breakdown.
> **Stack:** **Next.js (App Router) + TypeScript**, **Prisma + PostgreSQL**, **Auth.js** (OAuth), **Mapbox** maps, Tailwind. Containerised with **Docker**, deployed to **AWS (ECS Fargate + RDS)** via **GitHub Actions** CI/CD, infra in **Terraform**. MIT.
> **Companion doc:** `Trip_Planner_Product_Scope.md`.

---

## 1. Overview

> **Phase 1 — Trip Planner (early-August ship).** Dependency notes: **Task 2 (schema) underpins Tasks 4–7**. **Auth (Task 3) gates all app routes** — build it early. The **infra + CI/CD (Tasks 9–10)** can be stood up in parallel with app work, but **Task 10 depends on Task 8 (Dockerfile)** and **Task 9 (infra exists)**. ⚠️ The app is fully usable locally via docker-compose before any AWS work.

| # | Task | Layer | File(s) | Effort |
|---|------|-------|---------|--------|
| 1 | Scaffold + tooling + local docker-compose | Shell | `package.json`, `docker-compose.yml` | 1 d |
| 2 | Prisma schema + migrations | Data | `prisma/schema.prisma` | 1 d |
| 3 | Auth.js + authorization helper | Auth | `src/auth/*`, `middleware.ts` | 1.5 d |
| 4 | Trips CRUD | App | `src/app/trips/*`, `src/server/trips.ts` | 1 d |
| 5 | Itinerary: days + activities | App | `src/app/trips/[id]/*`, `src/server/itinerary.ts` | 2 d |
| 6 | Budget roll-up + currency | App | `src/server/budget.ts`, `src/lib/fx.ts` | 2 d |
| 7 | Maps (geocode + view) | App | `src/components/Map.tsx`, `src/lib/geocode.ts` | 1.5 d |
| 8 | Production Dockerfile | Ops | `Dockerfile`, `next.config.js` | 0.5 d |
| 9 | AWS infra (Terraform) | Ops | `infra/*.tf` | 2 d |
| 10 | CI/CD pipeline | Ops | `.github/workflows/deploy.yml` | 1.5 d |
| | **Phase 1 total** | | | **~14 d** |

> **Phase 2 — Sharing & Export (deferred):** trip sharing (link + co-editor) and PDF export. Reuses schema + auth. Not detailed here.

---

## 2. Core Logic — data model, authorization, money

Referenced by Tasks 3–7. Define it once here.

### 2.1 Data model
```prisma
// prisma/schema.prisma
model User  { id String @id @default(cuid()); email String @unique; trips Trip[] }

model Trip {
  id           String   @id @default(cuid())
  userId       String                       // owner
  name         String
  destinations String[]
  startDate    DateTime
  endDate      DateTime
  baseCurrency String                       // ISO 4217, e.g. "JPY"
  budgetMinor  Int                          // budget in base currency MINOR units (e.g. yen, cents)
  user         User     @relation(fields: [userId], references: [id])
  days         Day[]
  expenses     Expense[]
  @@index([userId])
}

model Day      { id String @id @default(cuid()); tripId String; date DateTime; activities Activity[] }
model Activity {
  id        String  @id @default(cuid())
  dayId     String
  title     String
  placeName String?
  lat       Float?
  lng       Float?
  startTime String?            // "09:30"
  endTime   String?
  category  String             // Food | Transport | Lodging | Sightseeing | Other
  notes     String?
  costMinor Int?               // in costCurrency MINOR units
  costCurrency String?         // ISO 4217 of the original cost
  sortOrder Int
}
model Expense  {               // big-ticket items not tied to a day (flights, hotels)
  id String @id @default(cuid()); tripId String; label String;
  category String; costMinor Int; costCurrency String
}
```
⚠️ **Money is stored in integer MINOR units + an explicit currency** — never floats. JPY has 0 decimals, EUR has 2; a `currencyMeta` table/const carries the exponent per currency.

### 2.2 Authorization — the single rule
Every read is **filtered by** the authenticated user; every mutation **re-checks** ownership.
```ts
// src/server/auth-scope.ts
async function requireTrip(tripId: string) {
  const userId = await currentUserId();          // from Auth.js session
  const trip = await db.trip.findFirst({ where: { id: tripId, userId } });
  if (!trip) throw new ForbiddenOrNotFound();    // → "doesn't exist or you don't have access"
  return trip;
}
```
⚠️ Nested resources (Day/Activity/Expense) are **always** reached *through* a `requireTrip` check — never queried by their own id alone. This is the no-bypass guarantee from Product §4.6.

### 2.3 Budget roll-up + currency conversion
```
spentBase = Σ over (activities with cost) and (expenses):
              convert(costMinor, costCurrency → baseCurrency)
remaining = budgetMinor − spentBase
status    = spentBase > budgetMinor ? OVER : OK
```
- `convert()` uses a **rates table** keyed by currency, refreshed daily from a rates API and **cached** (DB or memory). Conversion happens **on read**, so editing rates never rewrites stored costs (Product §4.6).
- Worked example (base = JPY):

| Item | Original | Rate→JPY | In JPY |
|---|---|---|---|
| Hotel | €420 | 165 | ¥69,300 |
| Dinner | €60 | 165 | ¥9,900 |
| Shinkansen | ¥14,000 | 1 | ¥14,000 |
| **Total** | | | **¥93,200** |

- If a currency has **no rate yet**: show the original amount, exclude from the converted total with a flag, retry on next refresh (don't block the UI).

### 2.4 Validation (server + client, exact copy from Product §4.6)
```ts
if (costMinor != null && costMinor < 0) error('Enter an amount of 0 or more.');
if (endDate < startDate) error('End date must be on or after the start date.');
```

---

# Phase 1 — Trip Planner

## Task 1 — Scaffold + tooling + local docker-compose
**File:** `package.json`, `docker-compose.yml`, `.env.example` · **Effort:** 1 d

### Task 1.1 — App scaffold
Next.js App Router + TS + Tailwind; ESLint/Prettier; Vitest + Playwright (smoke). Prisma client.

### Task 1.2 — Local stack
`docker-compose.yml` with the app + a Postgres container so `docker compose up` gives a full local environment. `.env.example` documents every var (DB URL, Auth secrets, Mapbox token, rates API key).

## Task 2 — Prisma schema + migrations
**File:** `prisma/schema.prisma`, `prisma/migrations/*` · **Effort:** 1 d

### Task 2.1 — Models  `# NEW`
Implement §2.1. `@@index([userId])` on `Trip`; cascade deletes Trip→Day→Activity.

### Task 2.2 — Migration + seed
Initial migration; a seed script with one example trip for local dev.

## Task 3 — Auth.js + authorization
**File:** `src/auth/*`, `middleware.ts`, `src/server/auth-scope.ts` · **Effort:** 1.5 d

### Task 3.1 — Auth.js (OAuth)
Auth.js with an OAuth provider (Google or GitHub) + Prisma adapter → no password handling. Session in the DB.

### Task 3.2 — Route protection + `requireTrip`
`middleware.ts` guards `/trips/*`; implement §2.2 `requireTrip` / `currentUserId`. ⚠️ All nested queries go through it.

## Task 4 — Trips CRUD
**File:** `src/app/trips/*`, `src/server/trips.ts` · **Effort:** 1 d

### Task 4.1 — Create/list/edit/delete
Server Actions for trip CRUD (name, destinations, dates, base currency, budget). Dashboard lists the user's trips + budget summary. Date validation (§2.4).

## Task 5 — Itinerary: days + activities
**File:** `src/app/trips/[id]/*`, `src/server/itinerary.ts` · **Effort:** 2 d

### Task 5.1 — Day generation
Generate `Day` rows across the trip date range; day-by-day view.

### Task 5.2 — Activity CRUD + reorder
Add/edit/delete activities (title, place, times, category, notes, optional cost+currency); `sortOrder` for reordering within a day. All mutations via `requireTrip`.

## Task 6 — Budget roll-up + currency
**File:** `src/server/budget.ts`, `src/lib/fx.ts` · **Effort:** 2 d

### Task 6.1 — Rates service
Fetch daily rates from a rates API **server-side**, cache them (§2.3). Never call the rates API from the browser (keeps the key server-side).

### Task 6.2 — Roll-up + panel
Compute `spentBase`, remaining, per-category, per-day per §2.3. Budget panel with over/under banner (exact copy, Product §4.6) and the no-rate fallback.

## Task 7 — Maps (geocode + view)
**File:** `src/components/Map.tsx`, `src/lib/geocode.ts` · **Effort:** 1.5 d

### Task 7.1 — Geocoding
Geocode a place name → lat/lng (Mapbox geocoding) when an activity's place is set; store on the Activity. ⚠️ Proxy the call through a Route Handler so the token isn't exposed (or use a URL-restricted public token).

### Task 7.2 — Map view
Mapbox GL map showing activity pins for the selected day/trip; two-way highlight with the itinerary list.
> ⚠️ Trim point: if early-August tightens, Maps (Task 7) defers to Phase 2 (Product §3).

## Task 8 — Production Dockerfile
**File:** `Dockerfile`, `next.config.js` · **Effort:** 0.5 d

### Task 8.1 — Multi-stage build
`output: 'standalone'` in `next.config.js`; multi-stage Dockerfile (deps → build → minimal runtime) producing a small image. Non-root user; `HEALTHCHECK`.

## Task 9 — AWS infrastructure (Terraform)
**File:** `infra/*.tf` · **Effort:** 2 d

### Task 9.1 — Networking + data
Terraform: VPC/subnets (or default), **RDS Postgres**, **ECR** repo, **Secrets Manager**/SSM for DB creds + Auth + Mapbox + rates keys.

### Task 9.2 — Compute
**ECS Fargate** service + task definition behind an **ALB**; security groups; task role pulls secrets at runtime. ⚠️ DB creds + tokens come from Secrets Manager — **never** baked into the image or committed.

## Task 10 — CI/CD pipeline
**File:** `.github/workflows/deploy.yml` · **Effort:** 1.5 d

### Task 10.1 — Build + push
On push to `main`: install, typecheck, lint, test, `docker build`, push image to **ECR** (tagged with the commit SHA). OIDC role assumption — no long-lived AWS keys in GitHub.

### Task 10.2 — Deploy + migrate
Register a new ECS task definition revision → update the service (rolling deploy). Run `prisma migrate deploy` as a one-off task **before** the service flips. ⚠️ Migrations run as a gated step so a bad migration fails the deploy rather than half-applying.

---

## Implementation Notes

- ⚠️ **Money is integer minor units + currency, never floats** (§2.1). Convert on read; preserve original currency. A `0.1 + 0.2` float bug in someone's holiday budget is exactly the kind of detail a reviewer notices.
- ⚠️ **Authorization is server-side and goes through `requireTrip`** for every nested resource (§2.2). The most common real vulnerability in apps like this is an IDOR where `/activities/:id` is fetched without checking the parent trip's owner — don't ship that.
- **Secrets:** DB creds, OAuth client secret, Mapbox token, rates API key all live in **Secrets Manager/SSM** and `.env` (gitignored). `.env.example` lists names only. ⚠️ Secret-scan before first push; never commit `.env`.
- **Mapbox token:** keep server-side or use a properly URL-restricted public token — don't ship an unrestricted secret token to the browser.
- **CI/CD uses GitHub OIDC** to assume an AWS role — no static `AWS_ACCESS_KEY` in repo secrets. This is a deliberate "I know how to do cloud auth properly" signal.
- **Cost control (it's your money):** Fargate + RDS run 24/7 and cost real dollars. Use the smallest sizes; consider scheduling/scaling to zero off-hours; document teardown (`terraform destroy`) in the README so reviewers know it's deliberate.
- **Migrations on deploy** are gated (Task 10.2) — a failed migration must fail the pipeline, not leave the DB half-migrated.
- **Presentable repo:** `main`, README with an **architecture diagram** (Next.js → ALB → Fargate → RDS, GH Actions → ECR), screenshots/GIF of the planner + budget, MIT `LICENSE`, green CI badge, Conventional Commits. The infra diagram is the headline for this repo.
- **Out-of-scope guardrails:** no booking, no scraped prices, one base currency per trip — sharing/export is Phase 2.
