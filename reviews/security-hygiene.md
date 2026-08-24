# Security & Repo Hygiene Review

Branch: `repo-review` (no fixes applied, no commit). Scope: whole repo, git-tracked files + history.

## Findings (ranked by severity)

### Low

1. **Third-party Action pinned to a mutable tag** — `.github/workflows/okf.yml:15`
   `uses: natcat38/okf-portfolio-standard@v1` is pinned to a tag, not a commit SHA. A tag can be
   force-moved (by the owner or if the account is compromised) to inject arbitrary code into CI.
   Low severity since it's the user's own action, but worth pinning to a SHA for supply-chain
   hygiene, especially since this workflow runs on `pull_request` from any fork.

2. **GitHub About block unverifiable locally** (reminder, not a finding) — the repo description,
   website link, and topics on GitHub can't be checked from a local clone. Verify manually that the
   About block doesn't leak internal details or stale info (e.g. Phase status, unlisted URLs).

### Informational / no action needed (verified clean)

- **Secrets scan**: no matches for common key/token patterns (`sk-`, `AKIA`, `AIza`, PEM private
  key headers, `ghp_`/`gho_`, Slack `xox*`) across tracked files. `.env.example` is names-only, as
  required by CLAUDE.md; `.gitignore:38-39` ignores `.env*` except `.env.example`. No `.env*`
  variant beyond `.env.example` is tracked.
- **CI secrets** (`.github/workflows/ci.yml`): `quality` job uses clearly-labelled throwaway values
  (`AUTH_SECRET: ci-test-secret-not-used-in-production`, a documented dummy `ENCRYPTION_KEY`).
  `deploy` job (real `PROD_DATABASE_URL`, `VERCEL_DEPLOY_HOOK_URL` secrets) is gated to
  `push` on `main` only, not `pull_request` — fork PRs never see production secrets. Workflow
  trigger is `pull_request`, not `pull_request_target`, so no privileged-secret-on-fork-PR risk.
- **`docker-compose.yml` / CI Postgres**: hardcoded `trip`/`trip` DB credentials are local-only
  (docker network / ephemeral CI service), matching `.env.example`'s local default — not a leak.
- **Authorization invariants** (`src/server/auth-scope.ts`, `sharing.ts`, `extensionToken.ts`,
  `extensionApi.ts`): spot-checked all non-test call sites in `src/server/*.ts`
  (attachments, votes, aiSettings, extensionApi, sharing) — every nested-resource read/write goes
  through `requireTripAccess`/`requireTripAccessForUser`/`requireTripOwner`, or (for the
  session-less `aiSettings.ts`) directly gates on `currentUserId()`. No `findFirst`/`findUnique`
  keyed on a bare resource `id` was found outside test files.
  `src/proxy.ts` matcher (`/trips/:path*`, `/settings/:path*`) correctly excludes `/shared/[token]`
  and `/api/*`; both of the latter self-authenticate (`identifyByExtensionToken` for
  `/api/extension/*`, share-token lookup for `/shared/[token]`).
  `src/server/sharing.ts:157-181` (`getSharedTrip`) strips `userId`/`shareToken` before return, and
  deliberately omits Places/Expenses/Attachments from its public `include` — matches CLAUDE.md's
  "strip at `sharing.ts`, never at the component layer" rule.
  `extensionToken.ts` uses a 256-bit CSPRNG token, SHA-256 lookup by unique index +
  `timingSafeEqual` belt-and-braces compare, and returns `null` (not a distinguishing error) for
  any invalid/unknown/revoked token — no token-enumeration side channel.
- **Input validation at trust boundaries**: `src/app/api/extension/places/route.ts` validates JSON
  parse failure, rejects non-object bodies (`null`/array/primitive) before field access, and
  coerces/truncates fields (`MAX_NAME_LENGTH`, `MAX_NOTES_LENGTH` in `extensionApi.ts`).
  `normaliseUrl()` (`extensionApi.ts:58-69`) restricts saved place URLs to `http:`/`https:`,
  closing a `javascript:`/`data:` stored-XSS vector. Errors are mapped to the same messages/status
  codes the rest of the app uses (404 for `ForbiddenOrNotFoundError`, 422 for `ValidationError`),
  avoiding trip-id enumeration via response differences.
- **Repo hygiene**: `.gitignore` covers `node_modules`, `.next`, build/test artifacts, `.env*`,
  `.vercel`, `*.tsbuildinfo`, and the generated Prisma client (`/src/generated/prisma`); no such
  paths are tracked (`git ls-files` clean). `git count-objects -vH` shows a small, unpacked history
  (~3.1 MiB, no loose packs). Largest blobs across full history are `package-lock.json` (~340 KB,
  expected) and long-form docs/plans (60-70 KB) — no accidental binaries, dumps, or media files in
  history. No stray `.zip/.sql/.dump/.bak` files tracked.
