---
name: project-settings-loading-breaks-token-flow
description: A loading.tsx on /settings stalls the extension-token server action past 20s and fails extension-api e2e; error.tsx there is fine.
metadata:
  type: project
---

Adding `src/app/settings/loading.tsx` breaks the extension-token flow. Measured
2026-08-29 on branch `polish/verified-medium-low`: with the file, `npx playwright
test e2e/extension-api.spec.ts --workers=1` fails 2-3 of 9 — the Generate-token
button sticks on "Working…" and `input[readonly]` never appears within the 20s
expect timeout. Delete the file and the same command passes 9/9 in ~12s. Verified
by bisecting the two new files: `src/app/settings/error.tsx` alone is green.

The settings page awaits `listAvailableModels()`, a live Groq/OpenRouter request;
the Suspense boundary `loading.tsx` introduces changes the streaming shape so the
post-action `revalidatePath('/settings')` re-render stalls the action's pending
state instead of resolving it.

**Why:** the "add a skeleton to slow routes" advice looks obviously safe and was
written up as a verified-cheap improvement, but it silently breaks a real flow
that only e2e catches — unit tests and `next build` both pass.

**How to apply:** don't add a route-level `loading.tsx` to `/settings`. If the
provider-call hang needs fixing, wrap only the model-list panel in its own
Suspense boundary rather than the whole route, and run
`npx playwright test e2e/extension-api.spec.ts` before believing it works.
Related: [[project-repo-review-2026-08]].
