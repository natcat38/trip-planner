---
name: feedback-measure-dont-assume-api-behavior
description: "When a security or correctness control depends on a browser/platform API's behavior in an edge case, measure what the API actually returns before trusting the obvious-looking check — a wrong assumption here has no runtime symptom"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9d02ddb6-0755-4373-abc9-7b2fb429b5cc
  modified: 2026-09-05T00:00:00.000Z
---

Trip-planner's Phase 3 M6 (2026-08-20) service worker cleared cached trip pages when a session
ended, detected by checking `response.redirected` and `response.url` on the sign-in redirect.
Both looked like the obviously correct fields to check — and both are **unpopulated for
navigation requests**. Navigation Requests carry redirect mode `manual`, so `fetch()` in a
service worker returns an opaque placeholder instead of following the 3xx. Instrumenting the
worker against the app's own sign-in redirect gave:
`{type: 'opaqueredirect', status: 0, ok: false, redirected: false, url: '<the requested page>'}`.
The control looked present, compiled, and ran — and did nothing. One user's cached trip pages
would have outlived their session on a shared browser. The correct check is
`type === 'opaqueredirect'`, scoped to the requested path.

**Why:** this class of bug has no visible symptom when broken — no error, no failed test, no
console warning. It only surfaces by deliberately measuring what the platform API returns in the
exact edge case the control depends on.

**How to apply:** when a control's correctness hinges on a browser/platform API's return value in
a specific scenario (a redirect, a race, a partial failure), don't trust documentation or the
field that looks obviously right — instrument and log the actual return value for that scenario
before shipping, and leave a test that would fail if the check silently stopped firing.
