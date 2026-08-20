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

// The session-ended signal. There is no sign-out control in the app yet, so
// this is the only hook available: any navigation that comes back having been
// redirected to Auth.js means the session is gone, and the pages cached for
// the previous session must not outlive it. Written against the redirect
// rather than a sign-out button so it keeps working once one is added.
function isSignInRedirect(response, origin) {
  if (!response.redirected) return false;
  const url = new URL(response.url, origin);
  return url.pathname.startsWith('/api/auth');
}

// Exposed for the node:vm test harness; harmless in a real worker.
self.__swInternals = {
  CACHE_NAME,
  isExcludedPath,
  isImmutableAsset,
  isCacheableNavigation,
  isSignInRedirect,
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
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
}

// Network-first: the itinerary changes, and a collaborator's edit landing a
// second ago matters more than saving a round trip. The cache is a safety net
// for when the network fails, not a performance layer.
async function handleNavigation(request, origin) {
  try {
    const response = await fetch(request);
    if (isSignInRedirect(response, origin)) {
      await clearAllCaches();
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

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const origin = self.location.origin;

  if (isCacheableNavigation(request, origin)) {
    event.respondWith(handleNavigation(request, origin));
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
