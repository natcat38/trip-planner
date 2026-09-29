---
name: project_attachment_upload_e2e_flake
description: Server-action e2e tests (uploads, and since 2026-09-30 the Add activity form) stall intermittently on CI; the action ran but the streamed response never finished. Much more frequent on Node 24; tracked in issue #56.
metadata:
  type: project
---

The two upload tests in `e2e/attachments.spec.ts` ("uploads a file and serves it back",
"accepts a file larger than the default Server Action body limit") stall on GitHub Actions
now and then: the Upload button stays on "Uploading…" until the 20s expect timeout, no error
banner. First seen flaky on `main` under Node 20 on 2026-08-31 (CI run 33370553457); during
the Node 24 upgrade (PR #55, 2026-09-24) one run failed the 2 MB test on all three attempts,
the identical rerun on the same Node 24.20.0 passed, and the same specs pass every time
locally on Windows (Node 24.16 and 24.20) and in a Linux `node:24.20-bookworm` container
run on their own. Running the FULL suite in that container with two workers reproduced it
once (2 MB test failed, passed on retry), so it is load-dependent, not runner-specific.
Sample sizes are small: 2 of 3 Node 24 CI runs showed an attachments flake versus 1 of 8
Node 20 runs on main, so Node 24 may make it more frequent; unproven.

2026-09-30 update: on the #55 doc-fix commit (run 36643630588, attempt 1) the stall hit
`e2e/select.spec.ts:50` (Add activity form, no upload) on all three retries; attempt 2 of the
same commit passed. So it is NOT upload-specific: any `useActionState` action that calls
`revalidatePath` can stall. Node 24 tally is now 3 of 5 CI attempts versus 1 of 8 on Node 20.
PR #55 was merged anyway to beat Vercel's 2026-10-01 Node 20 cut-off; issue #56 holds the
evidence and the Node 22 fallback plan.

What the Playwright trace of a stalled attempt shows: the multipart POST got a `200
text/x-component` with `x-action-revalidated: 1` in ~100 ms, so busboy parsed the body and
the action completed, then the chunked RSC re-render stream never finished. Next's
`pipe-readable.js` awaits the Node `'drain'` event when `res.write()` reports backpressure;
a `'drain'` that never arrives on a loaded two-core runner fits every observation. Not
reproduced outside CI, so unproven.

**Why:** on 2026-09-24 the evidence pointed to CI load, not the Node version. The
2026-09-30 data (more forms, higher Node 24 rate) weakens that; treat the version as a suspect.

**How to apply:** if an action-form e2e test stalls on a PR, rerun the job once and record the
result on issue #56. Follow #56's stopping rule (Node 24 vs 22 run comparison) instead of
re-investigating. A Route Handler for uploads alone no longer fixes it, because non-upload
forms stall too — see [[project-phase-status]] 2026-09-24 entry. Playwright config already retries twice on CI
and reports the retried test as flaky, so a genuine failure still shows.
