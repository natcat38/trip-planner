# ADR-0021: Sample-trip calls to action and a branded sign-in page

**Status:** Accepted (2026-11-09)

Owner decisions from the 2026-11-09 walkthrough of the open UX items: the call to action is
"both, split", and the sign-in page is variant B ("split pitch") with the drafted headline. Natalie
approved a throwaway prototype of all three sign-in variants before this was built.

## Context
- The landing page had one action, "Go to my trips", which leads straight to sign-in. A visitor
  who only wanted to look (a recruiter, say) had no way to the public demo trip except the README.
- The shared view's header had a `TODO(Natalie)` for a "Plan your own trip" link.
- Signing in used Auth.js's unstyled default page at `/api/auth/signin`: no name, no colours, no
  hint of what the app does.

## Decision
- **Both, split.** The landing page gets a secondary "View a sample trip" link to the demo share
  link. The shared view's header gets a "Plan your own trip" link to `/trips`.
- **Branded sign-in at `/signin`, variant B.** Left: the wordmark, the headline "Every day of the
  trip, and what it costs, on one page.", three one-line points and "View a sample trip, no
  sign-in". Right: "Sign in", "No password. Your Google or GitHub account is enough.", one 44 px
  button per provider (a server action calling `signIn`) and "Back to home". Below `lg` the two
  halves stack.
- `pages.signIn` in `src/auth.ts` and the redirect in `src/proxy.ts` point at `/signin`. The proxy
  sends a bare path as `callbackUrl`, and `src/lib/safeCallback.ts` accepts only a same-site path
  (no `//host`, no `/\host`, no absolute URL), so the page cannot become an open redirect. Auth.js's
  own origin check stays behind it.
- A failed provider round trip comes back as `?error=<code>`. The page shows one plain sentence
  rather than the internal code.

## Consequences
- `/signin` is public, like `/` and `/shared/[token]`: the proxy matcher does not cover it, and it
  reads no session or database state.
- The demo token is now in `src/lib/siteMeta.ts` (`SAMPLE_TRIP_PATH`), `README.md` and
  `package.json`'s `test:e2e:prod`. If the demo trip is ever re-shared, all three change together.
- The e2e suites assert `/signin?callbackUrl=` instead of `/api/auth/signin`. Auth.js's own
  endpoints under `/api/auth/*` are unchanged.
