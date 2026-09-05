---
name: project-ui-ux-audit-2026-08
description: "2026-08-31 UI/UX audit (WCAG 2.2 AA + Vercel Web Interface Guidelines + UX heuristics) — 30 findings, adversarially verified, fixed in PR #49/#50. Replaces docs/ui-ux-audit.md and docs/ui-ux-audit-verification.md, folded into memory per the user's reviews/ pattern."
metadata:
  node_type: memory
  type: project
---

Three parallel audits (a11y, Vercel WIG, UX heuristics) produced 30 ranked findings in
`docs/ui-ux-audit.md`, then adversarially re-verified against the code in
`docs/ui-ux-audit-verification.md` (18 confirmed, 9 partially confirmed with a correction,
3 refuted: #10 stale-write copy already existed, #30 `overscroll-behavior` inapplicable, #21
Mapbox keyboard pan/zoom already on). Both docs were removed from the repo and folded into
this file — full text remains in git history at commit 0de3062's parent if ever needed. See
[[project-repo-review-2026-08]] for the same fold-into-memory pattern, and
[[project-settings-loading-breaks-token-flow]] for a related settings-page gotcha.

**Fixed in PR #49 (0de3062, "destructive-action safety, forms, titles, a11y polish"):**
type-to-confirm danger zone for trip deletion (#1, #7); `ConfirmSubmitButton` + pending-disable
on settings "Remove key" (#2); Delete separated from Edit/Move on activity rows (#6);
focus-to-error-banner + `SubmitButton` migration at ~10 call sites (#3 partial, #8);
`generateMetadata` on 8 routes (#4, verified: `shared/[token]`, `trips/[id]/{edit,page,places,print}`,
`activities/[activityId]/edit`, plus 2 more); friendly `error.tsx` copy (#11); currency example
placeholders (#14); `beforeunload` unsaved-changes guard (#16); `touch-action: manipulation`
global rule (#9, verified `globals.css:149`); global link `hover:` treatment (#19); `aria-live`
copy-failure status (#15); `aria-current` on selected row (#20); named colour-swatch labels +
picker affordance (#13); new-tab cue on weather link (#22); stronger vote pressed state (#24);
map `NavigationControl` (#21); truncation guards (#12); empty states (#27); `--muted-fg` token (#30
reframed as polish, not a defect — text was already AA-passing at 4.56:1 light / ~7.8:1 dark).

**Fixed in PR #50 (298fe66, "high-value hardening"):** rate limiting, client-bundle split,
validation, CI polish — not itself a UI/UX-audit PR, but the memory index entry for #50 records
it alongside #49 in the phase timeline.

**Still open by design — #3, banner-only form errors:** every form still uses a single
top-of-form `role="alert"` banner; fields still lack `aria-invalid`/`aria-describedby`
(verified: `grep -rn aria-invalid src` → zero hits, current as of this fold). PR #49 fixed the
adjacent gap (focus moves to the banner on submit) but did not add per-field wiring — that is
a larger forms-architecture change (one shared field component with error slots) than the
audit's other items, and was deliberately deferred rather than done piecemeal across 8 forms.

**Corrections worth keeping from the verification pass (wrong standard/heuristic cited, real
issue kept):** #7 should cite Nielsen #5 not #6; #13 is not a WCAG 1.4.1 case (swatches do have
text labels) — it's a Nielsen #2/#6 naming issue; #17 is an empty state, not an error (Nielsen
#1, not #9); #25 should cite Nielsen #3/#4, not Jakob's Law.

**Not addressed / not tracked as a fix:** #17 (DayPlanner empty-state guidance), #18 (no
share-link holder visibility before revoke), #23 (single `<nav>` landmark), #25 (Settings only
reachable from trips-list header), #26 (destinations as raw comma-separated text), #28
(DayPlanner appends generic advice to every error), #29 (no upload progress) — none were in
PR #49's fix list and no later PR closed them; left open, low priority per the original ranking.
