# Trip Planner

Multi-user Japan/Europe trip planner: itinerary + multi-currency budget + maps,
plus trip sharing (public link + collaborators) and print-to-PDF export.
Read `docs/Trip_Planner_Tech_Scope.md` (§2 core logic), `docs/adr/` (decisions),
and `knowledge/index.md` (glossary) before implementing anything.
Read `memory/MEMORY.md` at session start — it is the agent memory for this repo
(standalone, in-repo, no `~/.claude` required); new memories go in `memory/`, not
in any tool-specific folder.
The scope docs' AWS deployment is superseded for Phase 1 — see docs/adr/0001.
New decisions → docs/adr/.

## Stack & deploy

Next.js App Router + TS + Tailwind · Prisma · Postgres (docker-compose locally, Neon in prod)
· Auth.js v5 (Google + GitHub) · Vitest + Playwright.
See `AGENTS.md` for Next.js version-drift notes (this Next.js version may differ from training data).
Confirmed drift: Next 16 renamed `middleware.ts` -> `proxy.ts` (`export const proxy`, not `middleware`) —
route protection lives in `src/proxy.ts`.
Prod deploys ONLY via the gated GitHub Actions pipeline (ADR-0002) — never deploy manually.
$0/month constraint: no always-on paid infra (ADR-0001).
One-time account-side setup (Vercel/Neon projects, secrets): `docs/deploy-setup.md`.

## Commands

- `docker compose up` — local stack (app :3000 + Postgres :5432)
- `npm run dev` — app natively (same local DB); `npm run test` / `test:e2e` / `lint` / `format`
- `npx prisma migrate dev` — after any schema change
- `/milestone` — the 5-step session loop (orient → plan → implement → verify → close)

## Non-negotiable rules

- **Money:** integer minor units + ISO 4217 currency. Never floats. Convert on read.
- **Authorization:** nested resources (Day/Activity/Expense) only via
  `requireTripAccess(tripId)` (owner or accepted collaborator), never by their own id alone.
  Deleting a trip and managing its sharing use `requireTripOwner(tripId)`.
- **Public share route:** `/shared/[token]` is the ONLY route with no auth gate
  (`src/proxy.ts` matches `/trips/:path*` only). Anything it returns is world-readable —
  strip owner/token fields in `src/server/sharing.ts`, never at the component layer.
- **Concurrency:** mutations carry `updatedAt`, reject stale writes (ADR-0003).
- **Secrets:** `.env` (gitignored) / Vercel env only. `.env.example` = names only.
