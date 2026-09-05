# Handoff: major-version upgrade spike

Written 2026-09-05 during the full-repo scan (PR #52). Working doc: delete it when the spike
lands, and record the outcome in `memory/project_phase_status.md` (the repo's pattern for
handoffs — see `memory/project_repo_review_2026-08.md`).

## Goal

Move the parked major-version bumps one at a time, each in its own PR with green CI, without
breaking the three invariants that have bitten this repo before:

1. Prisma's generated client must stay CJS (`moduleFormat = "cjs"`) or Playwright's test
   transform breaks — `memory/feedback_prisma_cjs_for_playwright.md`.
2. Anything under `'use server'` must only export async functions; tsc and vitest do NOT
   catch this, only `next build` does — run `npx next build` before pushing any upgrade PR.
3. CI env parity: a new test shape needs its env diffed against `ci.yml` —
   `memory/feedback_ci_env_parity_for_new_test_types.md`.

## State on 2026-09-05 (after PR #52's minor/patch bumps)

| Package | Current | Latest | Kind |
|---|---|---|---|
| next + eslint-config-next | 16.2.11 | 16.3.4 | minor, but Next minors ship breaking-ish changes; treat as major |
| react / react-dom | 19.2.4 | 19.2.8 | patch — fold into the Next PR |
| typescript | 5.9.3 | 7.0.2 | major (6 was skipped upstream) |
| eslint | 9.39.5 | 10.10.0 | major |
| vitest + @vitest/coverage-v8 | 4.1.10 | 5.0.0 | major (4.1.11 patch available first) |
| prisma / @prisma/client / @prisma/adapter-pg | 7.10.0 | 8.0.0-rc.13 | major, still RC — wait for GA |
| @types/node | 20.19.43 | 26.x | pinned to the Node 20 engine; bump only with a Node bump |
| next-auth | 5.0.0-beta.32 | (4.24 "latest" is older) | intentionally on the v5 beta; check for a newer beta only |

Node is pinned to 20.x (`package.json` engines, `ci.yml`). Node 20 leaves LTS maintenance in
April 2026 — a Node 22 bump is its own step, first in the order below, because several of
the majors raise their minimum Node.

## Order and per-step recipe

Do them in this order; each is one branch + PR. Stop and report at the first red step.

1. **Node 22** — `engines.node`, both `node-version` lines in `ci.yml`, `Dockerfile.dev`
   base image, Vercel project Node setting (dashboard, owner-side — note in
   `docs/deploy-setup.md`). Gate: full local gate + CI green + a Vercel preview build.
2. **Vitest 5** (+ coverage-v8 5) — read the v5 migration notes via context7 first. Watch
   `vitest.config.ts` coverage thresholds and `vitest.setup.ts` (`PG_POOL_MAX`, dotenv).
3. **ESLint 10** — flat config already in `eslint.config.mjs`; check `eslint-config-next`
   supports 10 before starting (may need to pair with step 4).
4. **Next 16.3 + React 19.2.8** — `AGENTS.md` drift notes apply (`proxy.ts`, not middleware).
   Gate must include `npx next build` and the full Playwright suite; `e2e/extension-api.spec.ts`
   is the canary for streaming/Suspense regressions.
5. **TypeScript 7** — expect new strictness errors; fix, don't loosen `tsconfig.json`.
6. **Prisma 8** — only once GA. Re-verify CJS output and that `prisma.config.ts` still
   drives the generator; `npx prisma migrate deploy` against a throwaway Postgres 16 container.

Per step:

```
git checkout -b chore/upgrade-<pkg>
npm install <pkg>@<version>              # lockstep packages together
npm run lint; npx tsc --noEmit; npx prettier --check .
npx next build
DATABASE_URL=<throwaway> npx vitest run
npx playwright test                      # or let CI run it
```

Local Postgres note: port 5432 may be held by another project's container; run a throwaway
`postgres:16-alpine` on 5433 and export `DATABASE_URL` for the test run (dotenv does not
override an already-set variable).

## Verification checklist for the whole spike

- [ ] CI green on every PR; prod deploy pipeline (ADR-0002) runs unchanged.
- [ ] `npm outdated` shows only intentionally-held packages (next-auth beta, Prisma RC).
- [ ] `memory/feedback_prisma_cjs_for_playwright.md` still accurate or updated.
- [ ] `AGENTS.md` version-drift notes updated for the new Next/TS versions.
- [ ] This file deleted; outcome recorded in `memory/project_phase_status.md`.
