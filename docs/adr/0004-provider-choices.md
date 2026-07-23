# ADR-0004: Provider choices — exchangerate-api.com FX + Google & GitHub OAuth

**Status:** Accepted (2026-07-23)

## Context
The tech scope left the FX-rates source and the OAuth provider ("Google or GitHub") open.

## Decision
- **FX rates:** exchangerate-api.com free tier (~1.5k req/month, 160+ currencies) — one
  server-side daily refresh; the key never reaches the browser.
- **Auth:** Auth.js configured with **both** Google and GitHub providers.

## Consequences
- Env vars: `EXCHANGE_RATE_API_KEY`, `AUTH_SECRET`, `AUTH_GOOGLE_ID`, `AUTH_GOOGLE_SECRET`,
  `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`.
- Both choices are cheaply reversible; recorded for traceability, not because they are
  hard to undo.
