---
name: project_attachment_upload_e2e_flake
description: e2e/attachments.spec.ts upload tests stall intermittently on CI only (Node 20 and 24 alike); trace shows the action ran and the streamed response never finished. Read before blaming a Node/Next upgrade for it.
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

What the Playwright trace of a stalled attempt shows: the multipart POST got a `200
text/x-component` with `x-action-revalidated: 1` in ~100 ms, so busboy parsed the body and
the action completed, then the chunked RSC re-render stream never finished. Next's
`pipe-readable.js` awaits the Node `'drain'` event when `res.write()` reports backpressure;
a `'drain'` that never arrives on a loaded two-core runner fits every observation. Not
reproduced outside CI, so unproven.

**Why:** it looks like a Node/Next regression the first time you meet it (it cost most of a
session on 2026-09-24) but the evidence says environment, not version.

**How to apply:** if this test fails on a PR, rerun the job before investigating; if it
starts failing every run, the upgrade path is a Route Handler for uploads using
`request.formData()` (bypasses the streamed server-action response) — see
[[project-phase-status]] 2026-09-24 entry. Playwright config already retries twice on CI
and reports the retried test as flaky, so a genuine failure still shows.
