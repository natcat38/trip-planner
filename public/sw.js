/**
 * Offline service worker (Phase 3 M6, ADR-0015).
 *
 * The rule this file implements: "what you've already looked at stays
 * available". It is not a region download and not a sync engine. Every page
 * the user actually visited while online is kept in the Cache API, and served
 * back verbatim when the network is gone.
 *
 * Two deliberate non-goals, both load-bearing:
 *
 * 1. Nothing cross-origin is ever cached. That is what keeps Mapbox tiles out
 *    (their device TTL is 12 hours and GL JS has no supported offline mode —
 *    see ADR-0015), and it holds structurally rather than by a hostname rule
 *    someone could forget to update.
 * 2. Only GET navigations are cached. Server Actions, the .ics export and the
 *    attachment download route are all left to fail honestly when offline
 *    rather than served a stale answer.
 *
 * This file is NOT bundled — it ships from public/ as-is, so it is plain ES5-
 * compatible script with no imports. src/lib/offline.test.ts evaluates this
 * exact file in a node:vm sandbox rather than re-implementing its predicates,
 * so the tested logic and the shipped logic cannot drift apart.
 */

// Bump to invalidate every cached page at once (e.g. after a layout change
// that would otherwise leave old shells around). activate() deletes any cache
// whose name doesn't match.
const CACHE_NAME = 'trip-planner-v1';

const OFFLINE_URL = '/offline';

// Paths never worth caching, checked against the request pathname:
// - /api/       auth callbacks and route handlers; caching an auth response
//               would serve someone else's redirect back to them.
// - /settings   renders the AI provider key UI (masked, but it is the one
//               page whose whole subject is a secret) — see src/proxy.ts.
function isExcludedPath(pathname) {
  if (pathname.startsWith('/api/')) return true;
  // The whole subtree, matching src/proxy.ts's '/settings/:path*' — not just
  // the exact path, so a future /settings/anything is excluded by default
  // rather than by remembering to come back here.
  return pathname === '/settings' || pathname.startsWith('/settings/');
}

// Next's build output under /_next/static/ is content-hashed, so a given URL's
// bytes never change and cache-first is always correct.
function isImmutableAsset(pathname) {
  return pathname.startsWith('/_next/static/');
}

// A page worth keeping for offline reading: a top-level document GET on this
// origin that isn't on the excluded list. `mode === 'navigate'` is what
// restricts this to real page loads — the RSC payload fetches Next issues for
// client-side <Link> navigation are plain fetches and fall through to the
// network untouched.
function isCacheableNavigation(request, origin) {
  if (request.method !== 'GET') return false;
  if (request.mode !== 'navigate') return false;
  const url = new URL(request.url);
  if (url.origin !== origin) return false;
  return !isExcludedPath(url.pathname);
}

// Routes src/proxy.ts guards. A navigation to one of these can only be
// redirected for one reason: there is no session. (/settings is protected too,
// but isExcludedPath keeps it out of the fetch handler entirely.)
function isProtectedPath(pathname) {
  return pathname === '/trips' || pathname.startsWith('/trips/');
}

// The session-ended signal for the redirect path. The direct path is the
// sign-out button (src/components/SignOutButton.tsx), which messages this
// worker to clear caches before the session ends (ADR-0015 §5). This is the
// fallback for when a session simply expires with no button click: a
// navigation to a guarded route that comes back a redirect means the session
// is gone, and the pages cached for it must not outlive it.
//
// It has to be spelled as `type === 'opaqueredirect'`, NOT as
// `response.redirected` plus a URL check. A navigation Request carries redirect
// mode "manual", so fetch() does not follow the 3xx — it hands back an opaque
// placeholder for the browser to follow itself. Measured against this app's own
// sign-in redirect: `{type: 'opaqueredirect', status: 0, ok: false,
// redirected: false, url: '<the requested page>'}`. Every field a redirect
// check would naturally reach for reads as "not a redirect", and the
// destination is not visible at all — which is why this is scoped by the
// REQUESTED path instead.
function isSessionEndedRedirect(response, requestUrl) {
  if (response.type !== 'opaqueredirect') return false;
  return isProtectedPath(new URL(requestUrl).pathname);
}

// Exposed for the node:vm test harness; harmless in a real worker.
self.__swInternals = {
  CACHE_NAME,
  isExcludedPath,
  isImmutableAsset,
  isCacheableNavigation,
  isProtectedPath,
  isSessionEndedRedirect,
};

// Pre-caching the offline page is best-effort: if waitUntil rejects the worker
// never activates, so a flaky network during install would silently mean no
// offline support at all — a worse outcome than one missing fallback page.
function cacheOfflinePage() {
  return caches
    .open(CACHE_NAME)
    .then((cache) => cache.add(OFFLINE_URL))
    .catch(() => {});
}

self.addEventListener('install', (event) => {
  event.waitUntil(cacheOfflinePage().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names.map((name) =>
            name === CACHE_NAME ? undefined : caches.delete(name),
          ),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function clearAllCaches() {
  const names = await caches.keys();
  await Promise.all(names.map((name) => caches.delete(name)));
  // Put the offline fallback back. Without this, clearing on sign-out also
  // throws away the one page that makes going offline degrade gracefully, and
  // it would not return until the worker was reinstalled — so the first
  // offline navigation after a sign-out would hit the browser's own network
  // error page instead.
  await cacheOfflinePage();
}

// Network-first: the itinerary changes, and a collaborator's edit landing a
// second ago matters more than saving a round trip. The cache is a safety net
// for when the network fails, not a performance layer.
async function handleNavigation(request) {
  try {
    const response = await fetch(request);
    if (isSessionEndedRedirect(response, request.url)) {
      await clearAllCaches();
      // Returned as-is so the browser follows the redirect itself, which is
      // what an opaqueredirect is for.
      return response;
    }
    if (response.ok) {
      const cache = await caches.open(CACHE_NAME);
      // Clone before the body is consumed by the browser rendering it.
      await cache.put(request, response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    if (offline) return offline;
    throw new Error('Offline and no cached copy of this page.');
  }
}

async function handleImmutableAsset(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response.clone());
  }
  return response;
}

// The direct sign-out path: SignOutButton posts { type: 'CLEAR_CACHES' } and
// awaits an ack on the MessagePort it sends, so the clear finishes before the
// sign-out action runs (ADR-0015 §5 requires clear-before-signout, not
// after). Reuses the same clearAllCaches() the redirect path uses, so there
// is exactly one implementation of "clear and restore the offline page" —
// not a second copy of CACHE_NAME or the restore logic in the button itself.
self.addEventListener('message', (event) => {
  if (!event.data || event.data.type !== 'CLEAR_CACHES') return;
  const port = event.ports && event.ports[0];
  event.waitUntil(
    clearAllCaches().then(() => {
      if (port) port.postMessage({ ok: true });
    }),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const origin = self.location.origin;

  if (isCacheableNavigation(request, origin)) {
    event.respondWith(handleNavigation(request));
    return;
  }

  const url = new URL(request.url);
  if (request.method === 'GET' && url.origin === origin) {
    if (isImmutableAsset(url.pathname)) {
      event.respondWith(handleImmutableAsset(request));
    }
  }
  // Everything else — cross-origin, non-GET, Server Actions, RSC payloads,
  // the .ics export, attachment downloads — is left entirely alone.
});
