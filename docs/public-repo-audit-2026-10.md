# Public-repo audit: trip-planner (2026-10-22, closed 2026-11-09)

Findings from the portfolio-wide public-repo audit that concern this repo, with the outcome of each.
The UX side of the same period is recorded in [`ux-audit-2026-10.md`](ux-audit-2026-10.md).

| ID | Finding | Outcome |
| --- | --- | --- |
| P1-1 | `summarizeBudget` exported from the `'use server'` file `src/server/budget.ts` with no access gate, so Next treats it as a callable Server Action. | Fixed in this PR. It now lives in `src/lib/budgetSummary.ts` (no directive); `budget.ts` exports only the gated `getBudgetSummary`; `sharing.ts` imports from the new module. `src/server/useServer.directive.test.ts` fails if any exported function in a `'use server'` module under `src/server` lacks a `require*` or `currentUser*` gate. |
| P1-2 | GitHub homepage and profile README linked an all-JPY shared trip. | Fixed earlier in natcat38/natcat38#2, and the repo homepage now points at the `YzdiQTCwe_` token (GBP and JPY). The older share token `OHLsGOq...` still returns 200. Owner action: revoke it from the owner's account (trip sharing settings). |
| P2-3 | Place `website` stored verbatim (`src/server/places.ts`), so a `javascript:` value would be rendered as a link. | Fixed in this PR. One shared rule, `parseHttpUrl` in `src/lib/webUrl.ts`, also used by `normaliseUrl` in `extensionApi.ts`. Form input with a non-http(s) scheme throws `ValidationError`; a value with no scheme gets `https://`; an OSM value that still fails is saved as `null`. Existing rows saved before this change are not rewritten. |
| P2-4 | README said "exactly three gates". | Fixed in this PR. README names the three trip gates plus the extension-token check (`identifyByExtensionToken`, `requireTripAccessForUser`) and the own-invite check (`requireOwnPendingInvite`). |
| P2-5 | Stale handoff and roadmap. | Obsolete. ROADMAP "Next up" tracks the major-upgrade spike and the final `/repo-review`. |
| P2-6 | Dependabot alerts off. | Owner decision 2026-11-09: alerts enabled. |
| #56 | e2e stall. | Closed 2026-10-28. |
| okf | Validator pinned to the stale `bfc3f18` (old v1.2.0 tag object) under a `# v1` comment. | Fixed in this PR. `.github/workflows/okf.yml` pins `a9d01a2b63545a4db537a1aaef0d05de1a0ea69a # v1.4.0`; a weekly `github-actions` Dependabot entry was added so the pin gets bump PRs. |
