# ADR-0015: Offline as a cache of visited pages, with no map tiles

**Status:** Accepted (2026-08-20)

## Context
Milestone 6's offline half (handoff §8) was specified as "service worker + IndexedDB caching of
already-viewed itinerary, notes, and map tiles — what you've looked at stays available, not region
downloads." Verifying that against the live platform before building changed two of its three
parts.

## Decisions

### 1. Map tiles are not cached — the offline map is a placeholder
Mapbox's own caching documentation sets a **12-hour device TTL** on vector tiles, GL JS has no
supported offline mode (that feature exists only in the Mobile SDKs), and neither the Terms of
Service nor the Product Terms grant a right to retain tiles beyond that. A service worker hoarding
signed tile URLs would be an unsupported deviation from a stated limit, and a fragile one: tile
URLs carry a token and GL JS sets its own cache headers.

Offline therefore shows the itinerary, day notes, checklist and budget — the text a traveller
actually needs at a station with no signal — and the map area says it needs a connection.

This is enforced structurally, not by a rule: `public/sw.js` caches **same-origin requests only**,
so every third-party host is excluded by construction rather than by a hostname list somebody has
to remember to maintain. `src/lib/offline.test.ts` asserts a Mapbox URL is refused.

Revisit only if the map matters enough offline to move `src/components/Map.tsx` to a raster
basemap whose licence permits caching. That is a map-layer rewrite, not a tweak.

### 2. The Cache API holds rendered HTML; there is no IndexedDB
This app is server-rendered end to end — there is no client-side data layer for an IndexedDB copy
of the itinerary to feed. Storing trip rows in IndexedDB would mean building a second renderer for
them that could disagree with the server's.

What the user visited is already a complete, correct rendering of their data, so the service worker
keeps *that*: network-first for same-origin GET navigations, cached on the way through, served back
when `fetch` throws. The cache is a safety net, not a performance layer — a collaborator's edit from
a second ago matters more than a saved round trip, so the network always gets asked first.

### 3. `experimental.useOffline` is not enabled
Next 16 ships a `useOffline` hook, but it is flagged "not recommended for production" and **caches
nothing** — it detects connectivity and retries blocked requests. The only part this app wanted is
the banner, which `navigator.onLine` and the two window events provide without an experimental
config flag. `useSyncExternalStore` is the correct React primitive for reading it.

### 4. Only GET navigations are cached
Server Actions, the `.ics` export and the attachment download route are all left to fail honestly
offline rather than be answered from a stale cache. A budget that silently renders yesterday's
number is worse than one that says it can't reach the server.

`/api/*` and the `/settings` subtree are excluded outright — the latter is the AI provider key UI,
and is excluded as a whole subtree so a future `/settings/<anything>` inherits the exclusion.

### 5. Cached pages are dropped when the session ends
Cached trip pages are readable by whoever next uses the browser profile — like history, but they
would survive a sign-out. **The app currently has no sign-out control anywhere**, so there is no
button to hang cleanup on. The worker instead clears every cache when a navigation to a
proxy-guarded route comes back a redirect, which is what `src/proxy.ts` does once a session is gone.

**How that check has to be spelled is not obvious, and the obvious version silently does nothing.**
A navigation `Request` carries redirect mode `manual`, so `fetch()` inside the worker does not
follow the 3xx — it returns an opaque placeholder for the browser to follow itself. Measured
against this app's own sign-in redirect, the worker sees:

```
{ type: 'opaqueredirect', status: 0, ok: false, redirected: false, url: '<the requested page>' }
```

`redirected` is **false** and the destination is **absent**. A check written as
`response.redirected && response.url.startsWith('/api/auth')` — which is what the API invites — can
never fire, and the control would look present while doing nothing. So the test is
`type === 'opaqueredirect'`, scoped by the **requested** path (the `/trips` subtree) rather than the
destination, since the destination isn't visible. `src/lib/offline.test.ts` encodes that measured
response shape so the mistake can't come back.

Scoping matters in the other direction too: a redirect on an unguarded route means something else
entirely and must not wipe someone's offline itinerary as a side effect.

Adding a sign-out control later should still call `caches.delete` directly — this only fires on the
*next* navigation.

### 6. The shipped worker is the tested worker
`public/sw.js` is served verbatim and is not bundled, so it cannot be imported by the test suite.
Rather than re-implement its predicates in a test — where they would drift the first time someone
edited one and not the other — `src/lib/offline.test.ts` evaluates the real file in a `node:vm`
sandbox and tests the functions it exposes. `e2e/offline.spec.ts` then covers what no unit test can
reach: whether a cached page actually comes back with the network switched off. It drives that
through `/shared/[token]`, since this repo has no test OAuth account (see `e2e/sharing.spec.ts`) and
the share route exercises the identical worker path.

## Consequences
- Offline is read-only. Any mutation attempted offline fails; the banner says so.
- In-app `<Link>` navigation offline is not guaranteed: Next fetches RSC payloads for client-side
  navigation and those are deliberately not cached. A full page load of a visited URL always works.
  If link navigation offline turns out to matter, caching RSC responses is the follow-up — it needs
  care, because those responses `Vary` on the router state tree.
- `/sw.js` is served with `no-store` (`next.config.ts`). A stale worker would pin users to an old
  caching policy indefinitely, including one we later decided was wrong.
- `CACHE_NAME` must be bumped to invalidate every cached page at once, e.g. after a layout change
  that would otherwise leave old shells in circulation.
