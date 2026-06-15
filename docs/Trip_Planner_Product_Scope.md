# Japan/Europe Trip Planner — Product Scope

> **Audience:** product/portfolio readers (and the recruiter who lands on the repo). Plain language, no code.
> **Status:** scoped, pre-build. Project #3 — the **full-stack + infrastructure showpiece**.
> **Target ship:** Phase 1 by **early August 2026**.

---

## 1. Background & Problem Statement

Planning a real multi-week trip (a Japan or Europe itinerary) means juggling two things at once: **what you'll do each day** (places, activities, times) and **what it costs** (flights, hotels, day-to-day spend, across multiple currencies). People end up spreading this across a spreadsheet, a notes app, and a maps app, with the budget never quite reconciled against the plan.

This project is a **single tool that ties the itinerary and the budget together**: every activity you plan carries its cost, and those costs roll up — across currencies — into a live budget for the trip. It's built around a **real trip** the author is actually taking, so it's a genuinely used tool, not a toy.

For the portfolio it's the **full-stack + infrastructure showpiece**: real authentication, a relational data model with per-user authorization, a maps integration, multi-currency money handling, and — the part that sets it apart — a **production-shaped deployment**: containerised with Docker, running on AWS (ECS Fargate + RDS), shipped by a **CI/CD pipeline**. It demonstrates not just building an app but **operating** one.

---

## 2. Proposed Solution

A **Next.js full-stack web app** where a signed-in user plans trips: a day-by-day itinerary with an integrated, multi-currency budget, places shown on a map, deployed to AWS via CI/CD.

**Phase 1 — Trip Planner (ships early August):**
- **Accounts** — users sign in; each user owns their own trips (nobody sees anyone else's).
- **Trips** — create a trip with dates, destination(s), a base currency, and a budget.
- **Itinerary** — for each day, add **activities** (title, place, time, category, notes) and reorder them.
- **Integrated budget** — every activity (and big-ticket items like flights/hotels) can carry a **cost in any currency**; the app converts everything to the trip's base currency and shows **spend vs budget**, broken down by category, updating live as you plan.
- **Maps** — activity places are geocoded and shown on a **map** for the day/trip.
- **Multi-currency** — JPY/EUR/etc. costs convert using up-to-date exchange rates.
- Deployed: **Dockerised → AWS (ECS Fargate + RDS Postgres) → via a GitHub Actions CI/CD pipeline**.

**Phase 2 — Sharing & Export (later):**
- **Share/collaborate** on a trip (read-only link or co-editor) and **export** an itinerary (e.g. PDF). Deferred.

### Core principle: the plan *is* the budget
> Costs aren't tracked in a separate ledger — they live on the itinerary items themselves. The budget is a **live roll-up of the plan**, converted into one base currency, so the answer to "can I afford this trip as planned?" is always current.

---

## 3. Scope of Work

> **Phase 1 — Trip Planner (early-August ship).** Goal: a signed-in user plans a multi-day, multi-currency trip with an integrated budget and a map, running in production on AWS via CI/CD.

| Layer | Task | Effort | Component |
|-------|------|--------|-----------|
| App | Scaffold (Next.js + TS + Tailwind + Prisma) + local docker-compose | 1 d | Shell |
| Data | Schema + migrations (User, Trip, Day, Activity, Expense) | 1 d | Data model |
| Auth | Authentication + per-user authorization | 1.5 d | Auth |
| App | Trips CRUD (dates, destination, base currency, budget) | 1 d | Trips |
| App | Itinerary: days + activities CRUD + reordering | 2 d | Itinerary |
| App | Budget roll-up + multi-currency conversion + category breakdown | 2 d | Budget |
| App | Maps: geocoding + map view of places | 1.5 d | Maps |
| Ops | Production Dockerfile (multi-stage, standalone) | 0.5 d | Container |
| Ops | AWS infrastructure as code (ECR, RDS, ECS Fargate, ALB, secrets) | 2 d | Infra |
| Ops | CI/CD pipeline (build → ECR → deploy → migrate) | 1.5 d | CI/CD |
| | **Phase 1 total** | **~14 d** | |

> **Phase 2 — Sharing & Export (post-launch).** Goal: collaborate on / share / export a trip.

| Layer | Task | Effort | Component |
|-------|------|--------|-----------|
| App | Trip sharing (read-only link + co-editor) | TBD | Sharing |
| App | Itinerary export (PDF) | TBD | Export |

**Total estimated effort (Phase 1): ~14 developer-days.**

> ⚠️ **Deadline note:** if early-August gets tight, **Maps** is the designated trim-to-Phase-2 item — the full-stack + infra story (auth, integrated budget, AWS, CI/CD) ships without it.

---

## 4. User-Facing Behaviour

### 4.1 Sign in
- The user signs in; on first sign-in an account is created. All trips are **scoped to the signed-in user** — every trip/day/activity/expense read or write checks ownership.
- States: signed-out users see a marketing/landing + sign-in; protected pages redirect to sign-in.

### 4.2 Trips
- **Create a trip:** name, destination(s), **start/end dates**, **base currency** (e.g. JPY or EUR), **budget amount**.
- A dashboard lists the user's trips with dates and a budget summary (spent / budget).

### 4.3 Itinerary
- The trip opens to a **day-by-day** view across the trip's date range.
- Per day, **add an activity**: title, **place** (searched + geocoded), start/end time, **category** (e.g. Food, Transport, Lodging, Sightseeing), notes, and an optional **cost** (amount + currency).
- Activities can be **reordered** within a day and edited/deleted.

### 4.4 Budget (integrated)
- A **budget panel** shows, live: **total spent vs budget** in the base currency, a **breakdown by category**, and **per-day** spend.
- Costs entered in any currency are **converted to the base currency** using current rates; the original currency is preserved and shown.
- Big-ticket **expenses** not tied to a single activity (flights, accommodation) can be added directly to the budget.

### 4.5 Maps
- The activities that have a place are shown as pins on a **map** (per day and whole-trip). Selecting an activity highlights its pin and vice-versa.

### 4.6 Budget & Currency Rules *(the rules that govern money + access)*
| Trigger | Where it appears | Copy |
|--------|------------------|------|
| Planned spend exceeds budget | Budget panel banner | `Over budget by ¥42,000 — you're 12% above your ¥350,000 plan.` |
| Spend within budget | Budget panel | `¥308,000 of ¥350,000 planned (88%).` |
| A cost has no exchange rate yet | Inline on that item | `Showing original amount — conversion rate unavailable, retrying.` |
| Invalid money input (negative / non-numeric) | Inline on the field | `Enter an amount of 0 or more.` |
| End date before start date | Inline on trip form | `End date must be on or after the start date.` |
| Accessing a trip you don't own | Server blocks; UI shows | `That trip doesn't exist or you don't have access.` |

> **Access is enforced on the server, not just hidden in the UI.** Every trip/day/activity query is filtered by the authenticated user's id, and every mutation re-checks ownership — so there is no client-side-only guard to bypass. Money is **stored in its original currency** and converted on read, so historical entries never silently change because a rate moved.

---

## 5. Decision Matrix

✅ allowed / valid · ❌ blocked with the §4.6 message

| Scenario | Signed in? | Owns the trip? | Input valid? | Outcome |
|----------|:---:|:---:|:---:|---------|
| Owner edits their trip | ✅ | ✅ | ✅ | ✅ Saved; budget re-rolls live |
| Not signed in | ❌ | — | — | ❌ Redirect to sign-in |
| Signed in, other user's trip | ✅ | ❌ | — | ❌ `That trip doesn't exist or you don't have access.` |
| Planned spend > budget | ✅ | ✅ | ✅ | ✅ Saves, shows over-budget banner |
| Cost in a currency with no rate | ✅ | ✅ | ✅ | ⚠️ Shows original amount, retries conversion |
| Negative / non-numeric cost | ✅ | ✅ | ❌ | ❌ `Enter an amount of 0 or more.` |
| End date before start date | ✅ | ✅ | ❌ | ❌ `End date must be on or after the start date.` |

---

## 6. Sharing & Export *(Phase 2 — deferred)*

Share a trip via a read-only link or invite a co-editor; export an itinerary to PDF. Out of scope for the early-August launch; captured so the roadmap is explicit.

---

## 7. Out of Scope

- **Sharing / collaboration / PDF export** — Phase 2.
- **Booking** — no flight/hotel booking or price search; the app plans and budgets, it doesn't transact.
- **Live flight/hotel price feeds** — costs are entered by the user (with currency conversion), not scraped.
- **Native mobile app** — responsive web only.
- **Offline mode.**
- **Multiple base currencies per trip** — one base currency per trip (individual costs can be any currency).

---

## 8. Rollout Plan

- **Phase 1 — Trip Planner:** ~14 dev-days · target **early August 2026** · containerised, running on **AWS (ECS Fargate + RDS)**, shipped by a **GitHub Actions CI/CD pipeline**; README with architecture diagram + screenshots/GIF; MIT-licensed; public live URL.
- **Phase 2 — Sharing & Export:** post-launch, effort TBD.
- **Default behaviour:** a new user lands on a landing page → sign in → empty trip list with a "Create your first trip" prompt (seeded example optional).
- **Infrastructure is part of the deliverable, not an afterthought:** the AWS + Docker + CI/CD pipeline is the differentiating story for this repo and is documented in the README.
- **Trim plan:** Maps is the first feature to defer to Phase 2 if the deadline tightens (see §3 ⚠️).
