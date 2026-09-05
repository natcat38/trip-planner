---
name: feedback-ci-env-parity-for-new-test-types
description: "Whenever a new kind of test lands (first to hit an authenticated route, decrypt something, or call a third-party API), diff its env needs against .github/workflows/ci.yml before trusting a green CI run"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9d02ddb6-0755-4373-abc9-7b2fb429b5cc
  modified: 2026-09-05T00:00:00.000Z
---

In trip-planner this exact gap recurred three times, each time invisible until the first test of
a new shape ran:

1. **Phase 2 (2026-08-12):** the first e2e test to hit an authenticated route needed
   `AUTH_SECRET` in the `quality` job's env. It had "worked by accident" until then.
2. **Phase 3 M3 (2026-08-20):** `aiSettings.db.test.ts` needed `ENCRYPTION_KEY`, present in local
   `.env` but not the workflow.
3. **Phase 3 M7 (2026-08-20):** the opposite shape — two e2e save tests silently depended on a
   live Mapbox call, and CI has **no** `MAPBOX_TOKEN` *deliberately* (this repo keeps live
   third-party calls out of CI). The fix was not to grant CI the secret; it was to split the
   tests by environment — save-success tests skip without a token, and a separate test asserts
   the honest-degradation path (422), which is what actually runs in CI.

**Why:** local `.env` accumulates whatever secrets got added ad hoc during development; CI's
env block only grows when someone remembers to update it. A test that transitively needs a new
secret passes locally and silently never gets meaningfully exercised in CI (or errors there for
a reason unrelated to the code under test).

**How to apply:** whenever a new test touches auth, decryption, or a third-party API for the
first time, check `.github/workflows/ci.yml`'s env block before trusting a green run. If the
secret is one this repo deliberately keeps out of CI (e.g. live third-party API keys), don't add
it — write the test to assert the degraded/honest-failure path instead, and verify both branches
locally by temporarily unsetting the var.
