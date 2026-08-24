# Production deploy setup (one-time, account-side)

Implements ADR-0001 (Vercel + Neon, $0/month) and ADR-0002 (GitHub Actions owns the gated
release). The workflow (`.github/workflows/ci.yml`) is already wired for this — the steps below
are the account-side setup only you can do (creating accounts/projects isn't something an
agent session should do on your behalf).

## 1. Neon (production Postgres)

1. Create a Neon project (free tier) at neon.tech.
2. Create a database (or use the default one) — this is production data, separate from the
   local docker-compose Postgres.
3. Copy the pooled connection string. This is your production `DATABASE_URL`.

## 2. Vercel (hosting)

1. Import this GitHub repo as a new Vercel project (free/Hobby tier).
2. **Disable automatic git deploys on push to `main`.** ADR-0002's whole point is that GitHub
   Actions — not Vercel's own git integration — decides when a deploy happens, so a bad
   migration blocks the release instead of Vercel deploying ahead of a half-applied DB. This is
   already handled by `vercel.json` in this repo (`git.deploymentEnabled.main = false`) — nothing
   to do here once the project is imported.

   **Do not** use the dashboard's "Ignored Build Step" setting for this instead — it was tried
   first and reverted. Ignored Build Step applies to *every* trigger, including Deploy Hooks, so
   it silently canceled the CI-triggered production deploy along with git-push deploys, breaking
   the pipeline in step 4. `git.deploymentEnabled` only gates git-push-triggered builds and
   leaves Deploy Hooks working.
3. Create a **Deploy Hook** for the production branch (Vercel dashboard → Project Settings →
   Git → Deploy Hooks). Copy the resulting URL — this is what Actions calls to trigger a deploy.
4. In Project Settings → Environment Variables, set every runtime var the app needs (same names
   as `.env.example`): `DATABASE_URL` (the Neon string from step 1), `AUTH_SECRET`,
   `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `MAPBOX_TOKEN`,
   `NEXT_PUBLIC_MAPBOX_TOKEN`, `EXCHANGE_RATE_API_KEY`. These are what the deployed app reads at
   runtime — separate from the GitHub secrets in step 3 below, which only the Actions pipeline
   itself uses.

## 3. GitHub repo secrets

Settings → Secrets and variables → Actions → New repository secret:

- `PROD_DATABASE_URL` — same Neon connection string as above (used only by the `deploy` job to
  run `prisma migrate deploy` against production before triggering Vercel).
- `VERCEL_DEPLOY_HOOK_URL` — the deploy hook URL from step 2.3.

## 4. Verify

Push to `main` (or merge a PR into it). The `deploy` job in CI should run only after `quality`
passes, apply any pending migrations to Neon, then call the deploy hook. Check the Vercel
dashboard for the resulting deployment.

## 5. Outstanding account-side actions

Carried over from the Phase 3 open-items ledger when it was retired (2026-08-24); none of these
are repo changes.

- **Set `ENCRYPTION_KEY` in Vercel.** `/settings` renders in production, but saving a BYOK AI
  key throws until it exists. Generate with
  `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`; it must differ
  from the local `.env` value, and rotating it later invalidates every stored user key.
- **Production has been smoke-tested, not functionally tested.** Sign-in, geocoding, FX, and
  the share flow have each been exercised, but no full end-to-end pass has been run against the
  production deployment itself.
