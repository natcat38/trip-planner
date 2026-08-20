# ADR-0017: The browser extension authenticates with a token, and geocodes server-side

**Status:** Accepted (2026-08-20)

## Context
Milestone 7, the last of the Phase 3 roadmap. §8 described it in one line: "MV3 extension: save a
place to a trip from any webpage via the app's own API; geocode via Nominatim (fits existing OSM
usage)." Re-verifying that before building contradicted two thirds of it.

## Decisions

### 1. The extension does not geocode — and Nominatim was never the app's geocoder anyway
Two independent findings, pointing the same way.

**The premise was wrong.** `src/lib/geocode.ts` geocodes with **Mapbox**, using a server-side token
that deliberately never reaches the browser. The app's OSM usage is Overpass (place *search*), a
different service under a different policy. "Fits existing OSM usage" described something the app
does not do.

**And Nominatim's policy forbids the shape anyway.** Its usage policy requires:

> No heavy uses (an absolute maximum of 1 request per second) … limit your requests to a single
> thread … 1 machine only, no distributed scripts … Results must be cached on your side.

An extension installed on N machines, each geocoding directly with its own fragmented cache, is
precisely a distributed script. Violations "will get you banned", and a ban lands on a free service
other people depend on.

So the extension sends a **name and a page URL**; the server geocodes, through the cache it already
keeps. Fewer moving parts, no API token in the extension, and the policy question disappears.

The lookup is biased with the trip's own destination first — `"Fuglen, Fukuoka"` before `"Fuglen"` —
because a blog post names a place, not a location, and the bare name lands wherever Mapbox likes
best.

### 2. A per-user bearer token, not the session cookie
The obvious approach is to let the extension ride the existing Auth.js session cookie. Two reasons
not to:

- **Portability.** The extension's origin is `chrome-extension://`, which browsers treat as
  cross-site, and the session cookie is `SameSite=Lax`. Whether a given browser makes an exception
  for extension-initiated requests is a question the sources actively disagree on — a bad thing for
  an auth mechanism to depend on.
- **Ambient authority, which is the real objection.** A cookie is attached automatically, so a
  cookie-authenticated write endpoint is reachable by any page in the browser and needs CSRF
  defence. A bearer token is never attached automatically. That removes the entire class rather
  than defending against it.

The token is generated in `/settings`, shown **once**, and stored **hashed**. Hashed rather than
encrypted because — unlike the AI key (ADR-0011) — it never needs displaying again, so there is
nothing to decrypt it for. Plain SHA-256 is the right primitive: the token is 32 bytes from a
CSPRNG, and bcrypt/argon2 exist to slow the guessing of *low*-entropy secrets. There is nothing
here to guess, and a slow hash would only slow every API request.

Generating a new token replaces the old one, which is also how a leaked one is rotated. There is
deliberately no list of active tokens: one browser needs one token.

### 3. `/api/extension/*` is public and authenticates itself
`src/proxy.ts`'s matcher covers `/trips` and `/settings` — **not** `/api`. These routes are
therefore reachable with no session at all, and `identifyByExtensionToken` is the only thing between
an anonymous HTTP request and a user's trips. That is the same property `/shared/[token]` has, and
it is deliberate in both cases; both are called out at the route.

Authorization for the trip itself still runs through the app's **single** access predicate.
`requireTripAccess` was split so that the "owner OR accepted collaborator" query lives in
`requireTripAccessForUser(userId, email, tripId)`, with the session path and the token path both
calling it. A second copy is exactly how the two would drift.

A trip the caller cannot reach returns **404 with the app's own message**, not 403, so responses
cannot be used to enumerate trip ids.

### 4. The modules that take a `userId` parameter must never be `'use server'`
`src/server/extensionApi.ts` and `src/server/extensionToken.ts` both carry the same warning as
`src/server/aiSettings.ts`, and here the stakes are higher: these functions take **`userId` as an
argument**. Published as Server Actions — which `'use server'` does to every export — any caller
could name whichever user they liked and act as them.

### 5. Saved pages upsert on their URL
`Place` already has `@@unique([tripId, source, sourceId])`. The extension writes `source:
"extension"` and `sourceId: <page url>`, so saving the same page twice updates that place rather
than adding a duplicate — the same reasoning `savePlace` uses for OSM results.

Only `http`/`https` URLs are accepted. The saved URL is rendered as a link in the app, so a
`javascript:` or `data:` URL here would be stored XSS dressed up as a bookmark.

### 6. Selected text beats the page title
The popup prefills from the page selection when there is one. A title like "Tokyo's 20 Best Ramen
Shops" is an article, not a place — using it as the default name would make the common case wrong.

## What is NOT verified, and why
**The extension's popup has no automated test.** This is a real gap, not an oversight, and it is
recorded here rather than left to be discovered.

`e2e/extension-api.spec.ts` covers the whole server surface over real HTTP — token generation
through the Settings UI, listing trips, saving a place, rejection of bad tokens, cross-user
isolation, revocation, `javascript:` URLs. What it cannot reach is `extension/popup.js` itself, and
one specific question: whether MV3's `host_permissions` let the popup's `fetch` reach the app, which
sends no CORS headers.

A Playwright spec for it was written and then removed, because Chromium could not be made to load an
unpacked extension on the development machine:

- `chromium.launchPersistentContext` with `--load-extension` failed with `spawn UNKNOWN` under
  several flag combinations, while the same call without those args launched fine.
- `channel: 'chromium'` made it fail every time; dropping it let the browser start.
- Playwright passes `--disable-extensions` by default, which suppresses `--load-extension`;
  removing that default via `ignoreDefaultArgs` still produced no extension.
- `chrome://extensions` — the documented way to read an unpacked extension's id when it has no
  background service worker — returns `ERR_INVALID_URL` in headless.

The manifest was checked and is valid UTF-8 and structurally correct, so this is an environment
problem rather than a defect in what ships. It also means CI would need the **full** Chromium build
rather than the headless shell it installs today, in a pipeline that has already had a run cancelled
by a hanging Playwright install step.

**To verify by hand** (30 seconds): load `extension/` unpacked at `chrome://extensions`, generate a
token in Settings, and save any page. If `host_permissions` turns out not to grant the CORS bypass,
the fix is CORS headers on the two `/api/extension/*` routes — safe to add there specifically
*because* they use a bearer token rather than cookies.

## Consequences
- The user copies a token once per browser. That is the cost of not using ambient authority.
- The extension's trip picker lists **owned** trips only, mirroring `listTrips` and the app's own
  dashboard. A collaborator cannot pick a trip shared with them, which is a pre-existing app
  behaviour surfaced rather than introduced.
- `host_permissions` includes `http://localhost:3000/*` so one build works against a dev server.
  That entry should be dropped if the extension is ever packaged for anyone else.
- Places saved this way have `source: "extension"`, which is a new value in that column alongside
  `"osm"` and `"manual"`.
