---
name: project-repo-review-2026-08
description: "2026-08-24 full repo-review outcomes — what was fixed (PR #42/#43), what each review pass concluded, and the standing decisions. Replaces the repo's reviews/ folder, which the user chose to fold into memory rather than keep in-repo."
metadata: 
  node_type: memory
  type: project
  originSessionId: 429a9cd9-6257-4cee-a1e8-ad09e6b219f9
  modified: 2026-08-24T13:07:30.526Z
---

The `reviews/` reports from the 2026-08-24 `/repo-review` were deliberately **removed from the
repo and folded into memory** — the user does not want agents hunting information in the repo.
This file is the durable record; the full reports exist in git history before the removal
commit on branch `polish/owner-decisions` if ever needed.

**What was fixed (PR #42, merged + deployed):** 13 verified correctness findings (savePlace
upsert data-loss, $0-expense coercion, ICS overnight DTEND, Invalid-Date bypass, ADR-0003
stale-write gaps in share-link toggles / pin colour / moveActivity, missing
ignoreIfMissing/ForbiddenOrNotFoundError handling in actions, two unhandled rejections,
db-test pg-pool cap), a shared `createTtlCache` helper replacing 5 hand-rolled copies,
Promise.all on the trip page, ADR-0019 design tokens through 33 files, README rewritten to
Phase 4 reality + demo-trip screenshots (light + dark), okf.yml action SHA-pinned. PR #43
retired all planning-era docs (phase-3 handoffs, docs/superpowers) after per-item verification;
owner-side actions moved to docs/deploy-setup.md §5.

**Pass conclusions worth keeping:**
- Security/hygiene: clean — no secrets in history, all auth invariants hold, API input
  validation solid, .gitignore complete.
- Over-engineering: the code is lean; ponytail: comments mark deliberate ceilings — treat as
  documented, not findings.
- Conventions: no CLAUDE.md violations beyond the fixed ADR-0003 gaps.
- Design: departure-board direction (ADR-0019) is faithfully implemented; the earlier gap was
  token adoption, now fixed. print/ExportButton.tsx keeps a hardcoded style on purpose — its
  comment cites an M10 contrast bug; "fixing" it to tokens would regress that.
- The **trips.db.test.ts full-suite flake root cause**: 11 parallel *.db.test.ts files × pg
  Pool max 10 vs Postgres max_connections 100 → PG_POOL_MAX=4 is set for Vitest runs
  (vitest.setup.ts; undefined in prod). The Playwright attachments.spec.ts load-flake is the
  same shape but separate (dev server, not the capped pools).

**Standing decisions from the user (2026-08-24):**
- Attachments encryption-at-rest (ADR-0016 §4): asked "is it easy?" — answered: moderate, the
  key-rotation/migration story is the real work; no go/no-go decided yet.
- Deferred features (Wikipedia enrichment, Wikimedia place photos, drag-and-drop reordering):
  user open to adding "if not too much hassle" — assessed as milestone-sized; should go through
  the /milestone loop with live API verification, not be bolted on.
- Cleanup findings and a UX smoke suite (dev+prod same-way testing) were implemented on
  `polish/owner-decisions`.
- Prod demo shared-trip link for the README: pending the user running db:seed against Neon (no
  PROD_DATABASE_URL available locally; Vercel CLI unauthenticated).

**polish/owner-decisions branch (2026-08-24, later same day) shipped:**
- All 7 deferred cleanups: ChevronIcon merge; ConfirmSubmitButton wraps SubmitButton (which
  gained an optional onClick passthrough); popup.js withBusyButton; budget.ts single-loop with
  per-currency FX resolution; requireShareToken wrapped in React cache(); `optimisticUpdate`
  helper in src/server/errors.ts (converted itinerary/checklist/places/trips/sharing inline
  copies); `withFormErrors` in src/server/auth-scope.ts with a per-site errorClasses allowlist
  (converted ~11 actions; sites with custom shapes deliberately left).
- `e2e/ux-smoke.spec.ts`: target-agnostic unauthenticated UX flows (landing, /trips→sign-in
  with both providers, /offline, shared view via SHARED_TRIP_PATH env else skipped).
  `PLAYWRIGHT_BASE_URL` env skips the local webServer; `npm run test:e2e:prod` runs it against
  trip-planner-cyan-five.vercel.app (verified green: 3 passed, 1 skipped). Authenticated prod
  flows remain untestable without OAuth creds.
- Docs: ENCRYPTION_KEY/OAuth marked done in deploy-setup §5; Groq sign-up-broken reality
  recorded (README, ADR-0011 addendum, byok-ai.md).

**Production demo + a bug only prod exposed (2026-08-25).** A real demo trip now lives on the
production deployment (10-day Fukuoka itinerary, 9 activities, GBP+JPY expenses) and its
public share link is the README's live demo; `test:e2e:prod` sets SHARED_TRIP_PATH to it, so
the ux-smoke shared-trip test runs for real (4/4 green against prod). All 10 days are filled
(30 activities, mirroring prisma/seed.mts) — trip id cmt7j4geh000004k3ehcds7il, share token
YzdiQTCwe_2LuWzMswg4YWTNDGEOwcMQ, budget Y325,299 of Y450,000.

**Destination bias has a flip side, found while filling the demo:** appending the trip's
destinations[0] helps ambiguous names but HURTS places in another prefecture — "Yufuin Station,
Oita" + ", Fukuoka" geocoded to WALES, and "Yufuin Onsen, Oita" to NEW JERSEY. Bare "Yufuin" /
"Yufuin Onsen" resolved correctly. Several in-prefecture names also silently fall back to
Fukuoka city centre (33.589733,130.40514) rather than the specific landmark. A future
improvement would try each of the trip's destinations, or verify the result is near one of
them, rather than always biasing to destinations[0]. Verify pins with: fetch the /shared/<token>
HTML and regex the embedded \"lat\":..,\"lng\":.. pairs against a Japan bounding box.

Building it by driving the live app surfaced a genuine bug **local seeds could never catch**:
`resolveActivityData` (src/server/itinerary.ts) geocoded the bare user-typed place name with no
destination bias, so "Kushida Shrine" on a Fukuoka trip resolved to Newfoundland and "Hakata
Station" to India. The extension path (`extensionApi.ts`) had solved this all along by querying
`"<place>, <destination>"` first — the app's own path never got it. Fixed + 3 tests (PR #45).
**How to apply: the seed script supplies literal lat/lng, so no local test ever exercised
geocoding; features whose inputs the seed hardcodes are invisible to the whole local suite.**

Browser-automation lessons (claude-in-chrome, for future prod work):
- Submit buttons often ignore ref-clicks; click by COORDINATE instead.
- Coordinates inside a `browser_batch` resolve against the screenshot taken BEFORE the call —
  never `navigate` then click by coordinate in the same batch. Use two calls: navigate+wait+
  screenshot, then interact.
- Inline `<details>` forms must be opened before their submit will fire.
- `window.confirm` (delete trip) freezes the renderer and CDP times out; Enter did not clear it.
