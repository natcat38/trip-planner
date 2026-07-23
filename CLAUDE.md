# Trip Planner

Multi-user Japan/Europe trip planner: itinerary + multi-currency budget + maps.
Read `docs/Trip_Planner_Tech_Scope.md` (§2 core logic), `docs/adr/` (decisions),
and `knowledge/index.md` (glossary) before implementing anything.
The scope docs' AWS deployment is superseded for Phase 1 — see docs/adr/0001.

## Stack & deploy
Next.js App Router + TS + Tailwind · Prisma · Postgres (docker-compose locally, Neon in prod)
· Auth.js v5 (Google + GitHub) · Vitest + Playwright.
Prod deploys ONLY via the gated GitHub Actions pipeline (ADR-0002) — never deploy manually.
$0/month constraint: no always-on paid infra (ADR-0001).

## Commands
- `docker compose up` — local stack (app :3000 + Postgres :5432)
- `npm run dev` — app natively (same local DB); `npm run test` / `test:e2e` / `lint` / `format`
- `npx prisma migrate dev` — after any schema change
- `/milestone` — the 5-step session loop (orient → plan → implement → verify → close)

## Non-negotiable rules
- **Money:** integer minor units + ISO 4217 currency. Never floats. Convert on read.
- **Authorization:** nested resources (Day/Activity/Expense) only via `requireTrip(tripId)`,
  never by their own id alone.
- **Concurrency:** mutations carry `updatedAt`, reject stale writes (ADR-0003).
- **Secrets:** `.env` (gitignored) / Vercel env only. `.env.example` = names only.

## Workflow
All changes via branch → PR → green CI → merge (branch protection on main).
Conventional Commits. New decisions → docs/adr/. Glossary lives in knowledge/ (CI-validated).
