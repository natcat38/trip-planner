---
name: project-phase-status
description: "Append-only phase log. Phases 1-4 all merged and live (Phase 4 = M8-M10 open-items closure, UI compliance, design elevation). 2026-08-24 full repo-review branch/PR #42: 13 verified correctness fixes, design tokens, README to Phase 4 reality, screenshots."
metadata: 
  node_type: memory
  type: project
  originSessionId: 9d02ddb6-0755-4373-abc9-7b2fb429b5cc
  modified: 2026-08-24T13:00:04.897Z
---

## Current state (2026-09-02)

Phases 1-4 are all merged and live in production, plus all five items from the
2026-08-28 audit handoff (PR #50, see log). Nothing is mid-flight; the handoff doc
`docs/handoff-high-value-improvements.md` is deleted (it was local-only/untracked).

Everything below is an append-only log, oldest first — read it only when you need
the *why* behind a past decision. The newest entries are at the bottom.

## Log

As of 2026-07-29, Phase 1 of the trip planner is done, merged to `main`, and **live in
production** — this supersedes the earlier "not live yet" state of this memory.

- Milestones 0-7 (scaffold, schema, auth, trips, itinerary, budget, maps) — see git log for detail.
- Deploy pipeline (ADR-0002): gated GitHub Actions job runs `prisma migrate deploy` against Neon
  then triggers a Vercel deploy hook.
- Account-side setup from `docs/deploy-setup.md` is complete: Neon project, Vercel project
  (`natcat38s-projects/trip-planner`, prod domain `trip-planner-cyan-five.vercel.app`), Google
  OAuth (Cloud project `trip-planner`, published/verified-not-required since only email+profile
  scopes), GitHub OAuth App, Mapbox, exchangerate-api.com. All 9 Vercel env vars and both GitHub
  repo secrets (`PROD_DATABASE_URL`, `VERCEL_DEPLOY_HOOK_URL`) are set.
- End-to-end deploy verified Ready (not just CI green) — confirmed a real production deployment
  succeeded via the Deploy Hook after fixing a pipeline bug (see below).

**Pitfall hit and fixed (PR #10, #11):** Vercel's dashboard "Ignored Build Step" setting (used to
disable git-push auto-deploy per ADR-0002) also silently cancels Deploy Hook-triggered
deployments — it applies to every trigger type, not just git pushes. This broke the CI pipeline
(hook call succeeded, deployment got Cancelled). Fixed by reverting that dashboard setting to
Automatic and instead adding `vercel.json` with `git.deploymentEnabled.main = false`, which only
gates git-push triggers and leaves Deploy Hooks working. `docs/deploy-setup.md` step 2.2 now
documents this correctly. **How to apply:** if setting up a similar Vercel+GitHub-Actions gated
deploy pattern again (this project or another), use `git.deploymentEnabled` in `vercel.json`, not
the Ignored Build Step dashboard control.

**Update (2026-08-11):** Phase 2 is now fully specced and planned, not yet implemented:
- Design spec: `docs/superpowers/specs/2026-08-11-phase2-sharing-export-design.md` (brainstormed,
  approved, merged).
- Implementation plans: `docs/superpowers/plans/2026-08-11-phase2-sharing.md` (16 tasks) and
  `docs/superpowers/plans/2026-08-11-phase2-export.md` (5 tasks) — sharing first, export second
  (both plans written before either was executed).
- Ran a `grill-with-docs` session against both plans: standardized terminology on "Collaborator"
  (not "co-editor" — docs originally said co-editor, now fixed everywhere), added ADR-0006
  (Collaborators matched by email, not a User FK — deliberate, see [[feedback_branch_before_writing]]
  for an unrelated process lesson from the same session) and ADR-0007 (export via browser
  print-to-PDF, not server-generated, to stay within ADR-0001's $0/month constraint), added
  `TripCollaborator.updatedAt` per ADR-0003's blanket rule, added `knowledge/domain/sharing.md`.
  Also fixed a real duplicate-import bug found in the sharing plan's own steps during self-review.
- **Update (2026-08-12): sharing plan fully executed and merged to main** via
  subagent-driven-development (16 tasks, each with implementer + spec-compliance reviewer +
  code-quality reviewer subagents). Real bugs caught and fixed along the way: a duplicate-import
  bug in the plan itself (found during self-review before execution), a missing no-email-fallback
  test on `requireTripAccess`, an information-exposure bug (`getSharedTrip` leaked `userId`/
  `shareToken` to anonymous visitors — fixed before Task 14 built on it), a hydration mismatch in
  `SharingPanel`'s share-URL display (fixed via `useSyncExternalStore`), a missing `noindex` on
  the public `/shared/[token]` route, and two CI gaps the new e2e test/directory exposed: `AUTH_SECRET`
  was never set in the `quality` job's env (worked by accident until a test finally hit an
  authenticated route), and the OKF knowledge-bundle validator required a purpose doc-comment for
  the new `src/app/shared/[token]` directory. All fixed, merged via PR #19.
- **Update (2026-08-12): export plan fully executed and merged to main** (PR #20) — Phase 2 is
  now completely done end-to-end. `/trips/[id]/print` page + "Export PDF" button, browser
  print-to-PDF (ADR-0007, no server dependency). Went beyond the plan's original scope: the
  original Task 4 only planned an unauthenticated-redirect e2e test (no test OAuth account in
  CI). The user asked for real automated coverage instead of pure manual click-through, and a
  legitimate technique was found: seed a real Auth.js database session directly via Prisma (same
  pattern as this repo's `.db.test.ts` suites) and set the cookie via Playwright's
  `context.addCookies()` (works at the browser-context/CDP level, unaffected by `httpOnly` —
  which only blocks page-JS `document.cookie` access). This surfaced a real, repo-wide blocker:
  the generated Prisma client was ESM-only (`import.meta.url`, no CJS fallback) and Playwright's
  CommonJS test transform couldn't load it — not even via dynamic `import()` (the failure moved
  one level deeper, into the generated client's own static import). **User explicitly approved**
  the fix (asked first, given the blast radius): `moduleFormat = "cjs"` on the Prisma generator in
  `prisma/schema.prisma`, then regenerated. Verified nothing else broke: full typecheck, lint,
  format, all 107 vitest tests, `next build`, and the full e2e suite (including the already-merged
  sharing feature) all still pass. See [[feedback_prisma_cjs_for_playwright]] for the generalizable
  lesson.
- **Phase 2 is complete.** Both sharing (PR #19) and export (PR #20) are merged to `main`. No
  further Phase 2 work is planned; check `docs/Trip_Planner_Product_Scope.md` or ask the user for
  what's next.
- Unrelated in-flight item noticed mid-session: README.md had an uncommitted rewrite (real status,
  ADR summaries) sitting in the working tree from outside this conversation — it got committed
  (with Phase 2 additions folded in) as part of cleaning up, per explicit user instruction.

**Update (2026-08-19): Phase 3 fully researched and decided, not implemented.** Everything lives
in `docs/phase-3-research-layer-handoff.md` (branch `docs/phase-3-research-layer-handoff`): a
verified Milestone 1 plan (saved-places tray + Wikivoyage guide, no LLM) plus a user-decided
M2–M7 roadmap (Transitous transit routing → BYOK AI via OpenRouter/Groq → guided multi-option
day generation → QoL pack → offline PWA + attachments → browser extension). Key falsified
assumptions are in that doc's §3 — read it before re-researching anything (OSM has no prices,
Gemini free tier is EEA-ToS-blocked, GitHub Models is retired, Google Routes API is
doubly-blocked, star ratings are structurally unfree). Execution is intended for a fresh session:
Opus orchestrator + Sonnet subagents, per [[feedback_subagent_plan_execution]].

**Update (2026-08-20): Phase 3 Milestone 1 is merged and live in production** (PR #25, squashed to
`e97ed44`). Places route + Place model +
`src/lib/research/{overpass,wikivoyage}.ts` + `src/server/places.ts`, coordinate passthrough in
`createActivity`, ADR-0008 and ADR-0009. Full gate green: 173 vitest, 10 Playwright, tsc, build,
prettier, file-map. Executed via subagents per [[feedback_subagent_plan_execution]].

Three real bugs the subagents' own green tests did NOT catch — all found by running the code
against the live APIs, which is why that step is not optional here:
1. The wikitext stripper dropped all `{{templates}}`, but Wikivoyage's prices live *inside*
   `{{see|price=...}}` listing templates — Fukuoka would have rendered empty.
2. The Overpass search term was not regex-escaped, so `café (old town)` silently returned nothing.
3. Requiring a plain `name` tag made `nearestStation` return null in central Fukuoka, where bus
   stops carry only `name:ja-Latn`.

M1's own CI run on main was **cancelled** mid-`quality` (a Playwright install step hung); the fix
merged separately as PR #26 (`08ad63f`). Because `prisma migrate deploy` applies *all* pending
migrations, #26's deploy job is what actually applied `20260819160532_add_place_model` to Neon —
verified in its logs, plus a live smoke test (`/trips/<id>/places` redirects to sign-in in prod).
**How to apply:** a cancelled deploy on a migration-bearing commit is not necessarily a problem —
check whether a *later* successful deploy carried the migration forward before re-running anything.

Follow-ups from PR #25's review:
- **Done (PR #28, `a710a56`, deployed):** `geocode()` now has fx.ts's module-level cache (24h TTL,
  500-entry cap, only successful lookups cached so one Mapbox blip can't pin a place to "no
  coordinates" for a day).
- Still open: `nearestStation` in `src/lib/research/overpass.ts` ships unused — M2 consumes it.

**Local env gotcha (fixed 2026-08-20):** PR #26 changed the e2e suite to run against a production
build (`next build && next start`) instead of `next dev`. Auth.js only auto-trusts the Host header
in dev or on Vercel, so `next start` on a bare machine needs `AUTH_TRUST_HOST=true`. CI sets it in
`ci.yml`, and `.env.example` documents it, but a pre-existing local `.env` won't have it — the
symptom is 7 of 10 Playwright tests failing on `response.ok()` while CI is green on the same commit.
Added to the local `.env`. **How to apply:** when e2e fails locally but passes CI, diff the local
`.env` against `.env.example` and the workflow's `env:` block before suspecting the code.

**Update (2026-08-20): Phase 3 Milestone 2 is merged and live** (PR #29, squashed to `9e05c9c`).
Transitous transit routing + Google/Apple deep links + `src/server/transit.ts`, ADR-0010, and the
repo is now **MIT licensed** — that licence is a *prerequisite*, not housekeeping: Transitous's
usage policy requires consuming apps to publish their source under an open-source licence, a
clause the original Phase 3 research pass missed entirely.

**User decision (2026-08-20):** do NOT send Transitous the contact message their policy asks for
before using routing endpoints; instead enforce restraint in code. Implemented as five layers in
`src/lib/research/transitous.ts` — user-action-only (never on render), a cache keyed on
coordinates rounded to ~11m and departure times bucketed to 15min, a hard 10 req/min cutoff,
a circuit breaker, and a 15s timeout with no retries. `src/server/transit.ts` takes **activity ids,
not coordinates**, so the shared budget can't be used as a general routing proxy. If usage ever
grows past personal scale, making that contact stops being optional.

Live re-verification before building again beat the mocked tests — findings are in the handoff
doc's new **§10**, which corrects §3.8. The big one: **Transitous coverage is per-operator, not
per-city.** Kyoto Sta → Gion returns 5 itineraries; Kyoto Sta → Kinkaku-ji returns **0 at every
time of day** (bus-only, and Kyoto City Bus isn't in the feed). Also: responses reach ~1.8MB
(691KB of service alerts) with no param to trim them, and `routeShortName` is often an internal
feed id (a Toei leg came back as `"8478511"`) so lines resolve via routeLongName → routeShortName
→ agencyName.

**Testing limit worth knowing:** Playwright **cannot** intercept the Transitous call, because it
happens in a Server Action inside the Next.js process, not the browser. So there is no e2e
click-through test (it would hit the live volunteer service for real), and the "no fetch on page
load" assertion only catches a future *client-side* regression.

**Update (2026-08-20): Phase 3 Milestone 3 is merged and live** (PR #30, squashed to `8f657e6`).
BYOK AI layer: `/settings` route, AES-256-GCM key encryption (`src/lib/crypto.ts`), provider client
(`src/lib/ai/provider.ts`), `src/server/aiSettings.ts`, and one grounded feature — "Summarize this
guide" over already-fetched Wikivoyage text. ADR-0011.

**Groq is the default, reversing the roadmap's OpenRouter-first order.** Live re-verification found
the earlier research had it backwards: OpenRouter's free endpoints *generally require* permission
to train on and publish prompts, so the $0 path there costs privacy — the same objection that
disqualified Gemini. Groq forbids training unless the customer grants it. Also missed by the
earlier pass: OpenRouter ToS §7 bans reselling API access (fine for per-user BYOK, fatal for an
app-held key), and Groq's agreement says "not for consumer use" — unresolvable, carried in
ADR-0011 as an open risk.

**The security bug worth remembering:** `src/server/aiSettings.ts` originally carried `'use server'`,
which makes *every export* a Server Action — and Next treats those as public HTTP endpoints. That
published `getDecryptedKey` (returns the user's plaintext API key) as a callable endpoint. Caught in
code review, not by any test, because it has **no runtime symptom**. A source-level test now pins it.
**How to apply:** never put `'use server'` on a module with a secret-returning export; keep the
directive on the thin route-level actions file only.

**Three UX bugs only a real key exposed** (mocks were all green): no `max_tokens` so the provider
default cut answers mid-sentence; raw markdown output with nothing to render it; and a single shared
input budget that let Fukuoka's verbose "Eat" section starve "Get around" entirely, so the transit
fares never reached the model. Budget is now per-section, clipped at sentence boundaries.

**CI gap, same shape as the earlier AUTH_SECRET one:** `aiSettings.db.test.ts` needs `ENCRYPTION_KEY`,
which `.env` supplied locally and the workflow didn't. Added to `ci.yml`. **Whenever a new kind of
test lands, diff its env needs against `.github/workflows/ci.yml`.**

⚠️ **OUTSTANDING USER ACTION: `ENCRYPTION_KEY` is not set in Vercel.** Until it is, `/settings`
renders in production but *saving a key throws*. Generate with
`node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`. Rotating it later
invalidates every stored key.

**Fixed (PR #31):** the create-next-app boilerplate landing page. It survived three phases and a
whole-repo review because `e2e/smoke.spec.ts` only asserted `response.ok()` — boilerplate returns 200
perfectly well. The smoke test now asserts real content *and* the absence of the boilerplate strings.
**How to apply:** a status-code assertion cannot fail for the thing that is actually wrong.

**Update (2026-08-20): Phase 3 Milestone 4 is merged and live** (PR #32, squashed to `de5f96a`), and
the boilerplate landing page is fixed (PR #31, `0cd4506`). M4 is the differentiator: a questionnaire
(focus + pace, never a chat box) producing 2-3 candidate day plans from the saved tray, plus an
algorithmic path (proximity clustering + nearest-neighbour) so keyless users get real results.
ADR-0012.

**The key architectural move:** the grounding rule went from *requested* to *enforced*. The model
returns **ids only**, validated server-side against the trip's saved-places pool, and the response is
built from real `Place` rows. A hallucinated place has no code path to the screen regardless of
prompt or model. **How to apply:** when a model selects or orders things (rather than reformatting
prose), a prompt instruction plus a test asserting on that instruction is not enough — constrain the
output to references you can validate against data you already hold.

Data minimisation is deliberate: the model gets id/name/category/cuisine only — never trip name,
dates, budget, collaborator emails, or notes. Sending less beats adding another warning.

**Two provider bugs found only by running it against a real key** (M3 had shipped the first one):
`complete()` reported "model had no room to answer" as "provider unavailable" — reasoning models
spend most of the budget on hidden chain-of-thought (measured: 868 of 957 tokens) and return HTTP 200
with null content and finish_reason 'length'. And `response_format: json_object` turned out to be
load-bearing, not a nicety: without it the same model burned its whole budget and returned nothing.

**Local dev is now fully working (2026-08-20):** `.env` has Mapbox + Google/GitHub OAuth, so real
sign-in and OSM place search work locally. A separate GitHub OAuth App (`trip-planner (local)`) points
at `http://localhost:3000/api/auth/callback/github`; localhost was added as a second redirect URI on
the *existing production* Google client. Note GitHub now allows up to 10 redirect URIs per OAuth App
— the old one-callback-only limitation is gone.

⚠️ **OUTSTANDING: rotate two OAuth client secrets** — they were pasted into a chat transcript on
2026-08-20. The GitHub one is localhost-only (trivial). The **Google one is live in Vercel**: add the
new secret and update Vercel *before* deleting the old, or production sign-in breaks between steps.

**Update (2026-08-20): Phase 3 Milestone 5 is merged and live**, in two PRs — #33 (`0fa8b3e`:
ICS export, trip duplication, weather) and #35 (`d235527`: checklists, day notes, activity votes,
pin colours, theme toggle). #34 was the same work as #35 but GitHub auto-closed it when its base
branch was deleted on merging #33.

M5 decisions worth keeping (full reasoning in ADR-0013 and ADR-0014):
- **ICS uses floating local time** (no Z, no TZID). Day.date is UTC midnight and Activity.startTime
  is a bare "09:30" — the app has never held a destination timezone, so there is no honest zone to
  stamp. Upgrade path if ever wanted: Open-Meteo returns an IANA zone for coordinates.
- **Duplication never copies shareToken** (it's @unique — copying both throws AND hands the copy
  someone else's public URL), **never collaborators**, **never votes**. It DOES copy the checklist
  and day notes. Copied activities are re-pointed at the COPIED places via an old-id→new-id map.
- **duplicateSharedTrip is built ON TOP OF getSharedTrip**, so the places tray/expenses/collaborators
  are structurally unreachable rather than omitted by choice. Re-deriving the query would drift.
- **Weather forecast only reaches 16 days out** (`forecast_days=17` is a hard 400), so "no forecast"
  is the COMMON case for planning. Beyond the window it shows the same calendar dates one year
  earlier from the archive API, labelled "Last year on this date:" in the sentence itself.
- **Day.notes is deliberately world-readable** via /shared/[token] (getSharedTrip returns whole Day
  rows). Schema carries a comment. **How to apply: any new field on Day inherits that — check.**
- **Votes keyed by email** (ADR-0006 reasoning), presence IS the vote, P2002 on a racing
  double-submit is a no-op. Not exposed on the shared route.
- **Theme in localStorage, not Postgres** — must work on signed-out /shared/[token]. Tailwind 4
  configures dark mode in CSS via `@custom-variant`. The no-flash inline script in <head> is
  load-bearing and commented; "cleaning it up" into a useEffect reintroduces the flash.

**Process lessons from M5 (both cost real time):**
1. **Playwright's `reuseExistingServer: !CI` will silently adopt a stale local dev server.** Three
   e2e tests failed against a dev server started *before* a migration, so it ran a stale Prisma
   client. **Kill any local dev server before running `npm run test:e2e`.**
2. **Stacked PRs + squash merge:** merging the base PR deletes its branch, which **auto-closes** the
   stacked PR and leaves its branch carrying pre-squash commits. Recovery: capture the base branch
   tip SHA *before* merging, then `git rebase --onto origin/main <base-tip-sha> <stacked-branch>`,
   force-push, and open a **new** PR (a closed one whose base branch is gone cannot be reopened or
   retargeted).
3. A dead local Postgres shows up as 47 failing tests with `PrismaClientKnownRequestError` on
   `db.user.create` — check `docker compose up -d db` before debugging the code.

**RESOLVED (2026-08-24, per user):** `ENCRYPTION_KEY` was set in Vercel on 2026-08-20 and works
(the guide-summary button works in prod). Both OAuth client secrets were rotated. **The user
could NOT open a Groq account — Groq's sign-up page is broken (Aug 2026) — so OpenRouter is the
BYOK provider actually used in production**, despite Groq being the documented default;
recorded in the ADR-0011 addendum, README, and knowledge/integrations/byok-ai.md.

**Local dev is fully working:** `.env` has DATABASE_URL, AUTH_SECRET, AUTH_TRUST_HOST,
ENCRYPTION_KEY, MAPBOX_TOKEN, NEXT_PUBLIC_MAPBOX_TOKEN, and Google/GitHub OAuth (a separate
`trip-planner (local)` GitHub OAuth App; localhost added as a second redirect URI on the existing
Google client). Real sign-in works locally. **PowerShell blocks `npm` — use `npm.cmd`.**

**Update (2026-08-20): Phase 3 Milestone 6 is built** — PR #36, branch `feat/phase-3-m6`, one PR
with separate commits for the offline PWA and attachments. ADR-0015 and ADR-0016; handoff doc gained
**§11** (M6's live re-verification, mirroring §10's role for M2).

Three of the four things §8 specified for M6 changed on contact with the live platform:
- **Map tiles cannot be cached.** Mapbox's docs set a **12-hour device TTL** on vector tiles, GL JS
  has no supported offline mode (Mobile SDKs only), and neither the ToS nor Product Terms grant
  retention. Tiles are out; `public/sw.js` caches **same-origin only**, so every third-party host is
  excluded structurally rather than by a hostname list. The map area says it needs a connection.
- **IndexedDB had nothing to cache.** The app is server-rendered end to end — no client data layer
  to feed, and building one would mean a second renderer that could disagree with the server. The
  Cache API holds the visited HTML instead.
- **The attachment caps were decided without the numbers.** Vercel rejects any function request
  **and response** over 4.5 MB; Neon's free plan allows **0.5 GB for the whole database**. Hence
  4 MB/file, 20 MB/trip. Next's `serverActions.bodySizeLimit` also defaults to **1 MB** and had to be
  raised or uploads would have failed before the action ran.
- Next 16's `useOffline` exists but is flagged not-for-production and **caches nothing** — detection
  and retry only. Not enabled; `navigator.onLine` covers the banner.

**The M6 bug worth remembering (found in code review, then settled by measurement):** the service
worker's "clear caches when the session ends" control tested `response.redirected` and
`response.url`. **Neither is populated for a navigation.** Navigation Requests carry redirect mode
`manual`, so `fetch()` in a worker returns an opaque placeholder instead of following the 3xx.
Instrumenting the worker against this app's own sign-in redirect gave:
`{type: 'opaqueredirect', status: 0, ok: false, redirected: false, url: '<the requested page>'}` —
`redirected` is **false** and the destination is **absent**. The control looked present and did
nothing, so one user's cached trip pages would have outlived their session on a shared browser.
Correct test is `type === 'opaqueredirect'`, scoped by the **requested** path.
**How to apply:** when a security control has no visible symptom when broken, measure what the API
actually returns before trusting the reading that looks obvious — and leave an e2e test that would
fail if it silently stopped firing.

Other M6 decisions:
- **Attachment content type is read from the file's bytes and the declared type discarded** — these
  are served back from the app's own origin, where an uploaded `text/html` would be same-origin
  script. Download route re-checks the allowlist and sets `nosniff` + `Content-Disposition:
  attachment` + `no-store`.
- **`listAttachments` selects neither `data` nor `uploadedBy`** — the latter is a collaborator's
  email, and votes strip exactly that for exactly that reason (ADR-0014). Column kept for provenance.
- **Attachments are never on `/shared/[token]`** and are not copied by trip duplication.
- **The app still has no sign-out control anywhere** — noticed while deciding where to clear the
  cache. Worth adding; the worker's redirect-based clear works today and keeps working after.

**Deliberately not built in M6:** encryption at rest for attachments (needs a key-rotation story;
UI says plainly that passports and ID don't belong there), and caching RSC payloads — so offline
in-app `<Link>` navigation isn't guaranteed, though a full page load of a visited URL always works.

**M7 CI failure worth remembering — a NEW variant of the recurring env gap.** The earlier ones
(`AUTH_SECRET`, `ENCRYPTION_KEY`) were "CI is missing a secret it should have". This one was the
opposite: my two e2e save tests quietly depended on a **live Mapbox call**, and CI has no
`MAPBOX_TOKEN` *deliberately* — this repo keeps live third-party calls out of CI (transit.spec.ts
asserts Transitous is never called). `requireEnv('MAPBOX_TOKEN')` sits INSIDE `geocode()`'s try, so
a missing token returns null rather than throwing, and the app correctly answered 422; the tests
asserted 200. **Fix was to split by environment, not to add the secret**: save-success tests skip
without a token, and a complementary test asserts the honest-degradation path, which is what runs in
CI. **How to apply: before adding an e2e test that touches a third-party API, ask what CI has — and
prefer asserting the degraded path there over granting CI live credentials.** Verified both branches
by masking MAPBOX_TOKEN in `.env` and re-running (same technique as the ENCRYPTION_KEY case).

**Everything noticed-but-not-built across M1-M7 is collected in
`docs/phase-3-open-items-handoff.md`** (added 2026-08-20) — outstanding owner actions, gaps in
shipped features, deferrals with their reasoning, genuinely unresolved questions (Groq's "not for
consumer use" clause), and what was skipped outright. **Read it before proposing Phase 3 follow-up
work**, so closed decisions don't get re-litigated.

**Update (2026-08-20): Phase 3 Milestone 7 is MERGED — PHASE 3 IS COMPLETE (M1-M7).** PR #37,
squashed to `bb18eac` on main; M6 was PR #36 -> `2404b28`. MV3 extension in `extension/` (plain JS, no build step) + token-authenticated
`/api/extension/*`. ADR-0017; research handoff gained **§12**.

**Two thirds of M7's one-line plan was wrong, and one error was about THIS repo:** §8 said "geocode
via Nominatim (fits existing OSM usage)" — but `src/lib/geocode.ts` geocodes with **Mapbox**,
server-side, and this app's OSM usage is **Overpass** (place search), a different service. Then
Nominatim's own policy turned out to forbid the pattern anyway: **"1 machine only, no distributed
scripts"**, results **"cached on your side"**. An extension on N machines with N caches is exactly
that, and a ban would land on a free service others depend on. So the extension sends a name + URL
and **the server geocodes**, biased with the trip's destination.

**Auth decision worth keeping:** a per-user bearer token, NOT the session cookie. Portability is the
lesser reason (`chrome-extension://` is cross-site, Auth.js cookie is SameSite=Lax, sources
disagree). The real one: **a cookie is ambient authority**, so a cookie-authenticated write endpoint
is reachable by every page in the browser and needs CSRF defence — a bearer token removes the class.
Stored **hashed** (SHA-256; 32 CSPRNG bytes have nothing to guess, so bcrypt/argon2 would only slow
every request), shown once, regenerating replaces.

**`/api/*` is NOT in `src/proxy.ts`'s matcher** — routes there are reachable with no session and must
authenticate themselves, same as `/shared/[token]`. Remember before adding any future API route.
Trip authorization still goes through ONE predicate: `requireTripAccess` was split so the
"owner OR accepted collaborator" query lives in `requireTripAccessForUser(userId, email, tripId)`,
used by both the session path and the token path.

⚠️ **KNOWN GAP: `extension/popup.js` has no automated test.** Chromium would not load an unpacked
extension on this machine — `spawn UNKNOWN` with `--load-extension`, `chrome://extensions`
unreachable in headless, no service worker even after removing Playwright's default
`--disable-extensions`. The manifest is valid, so it looks environmental. **Unverified specifically:
whether MV3 `host_permissions` grant the popup's fetch a CORS bypass.** Manual check is ~30s (load
`extension/` unpacked, generate a token, save a page); if it fails, add CORS headers to the two
`/api/extension/*` routes — safe there precisely because they use a bearer token, not cookies.

**M7 review finding worth remembering:** the upsert passed ONE payload to both `create` and `update`,
and the popup's notes box starts empty — so re-saving a page silently erased notes typed in the app.
**How to apply: an upsert's update payload is rarely the same as its create payload; any field the
client defaults to empty will erase whatever the user put there by hand.**

Also: I was confident a long URL as `sourceId` would exceed Postgres's btree index-row limit and 500
the save. Tested 1k–50k chars — every insert succeeded (Postgres compresses out of line). **Checking
beat "fixing" a non-problem.**

**Everything still open across Phase 3 lives in `docs/phase-3-open-items-handoff.md`** — now
including the extension gaps (§2.7 no popup test, §2.8 picker lists owned trips only, §2.9
host_permissions ships pointing at localhost too).

Per the handoff doc, **each milestone needs its own planning pass with live API re-verification
first** — that discipline has caught a real, plan-invalidating fact in every single milestone
(M1 OSM has no prices; M2 Kyoto's buses aren't in the transit feed; M3 OpenRouter's free tier
requires training-on-prompts; M4 reasoning models spend the whole budget thinking; M5 the forecast
only reaches 16 days; M6 Mapbox tiles can't be cached at all;
M7 the plan named the wrong geocoder for this very repo).

**Update (2026-08-24): Phase 4 is merged (M8 open-items closure #38, M9 UI compliance #40, M10
design elevation #41 — ADR-0018/0019, "departure board" direction). A full /repo-review ran on
branch `repo-review`, PR #42:** 13 verified correctness findings fixed (savePlace upsert data-loss,
$0-expense coercion, ICS overnight DTEND, Invalid-Date bypass, ADR-0003 stale-write gaps in
share-link toggles/pin colour/moveActivity, missing ignoreIfMissing/ForbiddenOrNotFoundError
handling, two unhandled rejections), design tokens wired through 33 files, README rewritten to
Phase 4 reality + screenshots from the seeded demo trip, knowledge/infra AWS docs corrected to
"deferred", okf action SHA-pinned.

**The long-unexplained trips.db.test.ts full-suite flake finally has a plausible root cause:**
11 parallel *.db.test.ts files × PrismaPg pg Pool (default max 10) ≈ 110 connections vs Postgres
max_connections=100 — cleanup queries fail to acquire a connection under load. Fixed by a
PG_POOL_MAX env cap (set for Vitest runs; undefined in prod). The Playwright-side load flake
(attachments.spec.ts under full suite, green in isolation) is the same shape but separate — the
e2e run uses the dev server, not the capped test pools.

**Still open for the user after PR #42:** delete ~3,300 lines of stale planning docs
(docs/phase-3-*-handoff.md, docs/superpowers/) — flagged, needs sign-off; set the GitHub About
block; optional dark-mode screenshot and prod shared-trip demo link in README. Review reports
live in `reviews/` on that branch.
**Update (2026-09-02): all five 2026-08-28 audit-handoff items shipped in one PR (#50,
squashed to `298fe66`, deployed).** Each item was verified by a subagent before
implementation; all five claims held. What landed:
- **Rate limiting** on the unauthenticated boundary: Postgres fixed-window counter
  (`RateLimitBucket` + `src/server/rateLimit.ts`, migration `20260902025419`). 5/hour on
  `duplicateSharedTrip`, 30/min on `/api/extension/*` via a shared `enforceRateLimit()`.
  Chosen over in-memory LRU because per-instance state can't bound abuse on serverless;
  no new service, so no ADR ($0/month intact).
- **ItineraryDays split**: server component + client islands `ItinerarySelection.tsx`
  (split selectedId/setter contexts) and `DayTiming.tsx`, with ONE shared `NowProvider`
  clock for the whole page. Weather `use()`+Suspense streaming preserved.
- **Validation parity**: new `src/server/validation.ts` (`requireText`/
  `requireOptionalText`, shared MAX_NAME_LENGTH=200 / MAX_NOTES_LENGTH=2000) replaced
  five per-file copies across expenses/itinerary/checklist/places/extensionApi.
- **CI**: `concurrency` cancellation on both workflows with main EXCLUDED
  (`cancel-in-progress: ${{ github.ref != 'refs/heads/main' }}`) so
  `prisma migrate deploy` can never be killed mid-run (ADR-0002).
- **Playwright**: `trace: 'on-first-retry'` + failure artifact upload in CI.

**The /code-review pass on the PR caught two things worth remembering:**
1. `duplicateSharedTrip` originally spent the rate-limit slot BEFORE `currentUserId()`
   and token validation — an anonymous caller could exhaust a share token's 5/hour
   budget with sessionless POSTs (the action endpoint is reachable without auth).
   **How to apply: rate-limit checks that consume budget go AFTER auth and input
   validation, or cheap failures drain the legitimate user's allowance.**
2. `RateLimitBucket` had no cleanup — every distinct key (incl. garbage tokens) left a
   permanent row against Neon's free-tier storage cap. Fixed with probabilistic (1%)
   stale-bucket deletion inside `checkRateLimit` (24h max age) — no cron, per ADR-0001.
Also from that review: rate-limited Save-a-copy now surfaces inline via
`DuplicateCopyForm` + `withFormErrors` instead of crashing to error.tsx, and the
extension now REJECTS over-long notes like the web app instead of silently truncating
(the truncate-vs-reject divergence would have made web edits of extension-saved notes
fail with an error the user never caused).

CI hiccup on the PR: the `gen-file-map.mjs --check` drift gate failed for the new files
— regenerating FILE-MAP.md is part of any PR that adds files (see
[[feedback_repo_wide_checks_during_multitask_execution]]).
