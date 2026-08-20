import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// public/sw.js ships to browsers verbatim — it is not bundled, so it can't be
// imported. Rather than re-implement its predicates here (where they would
// quietly drift from the shipped file the moment someone edits one and not the
// other), this evaluates the real file in a sandbox with just enough of a
// service worker global scope to load, and tests the functions it exposes on
// `self.__swInternals`.
const ORIGIN = 'https://trip-planner-cyan-five.vercel.app';

function loadServiceWorker() {
  const source = readFileSync(join(process.cwd(), 'public', 'sw.js'), 'utf8');
  const self: Record<string, unknown> = {
    location: { origin: ORIGIN },
    addEventListener: () => {},
    skipWaiting: () => {},
    clients: { claim: () => {} },
  };
  const sandbox = { self, URL, caches: undefined, fetch: undefined };
  runInContext(source, createContext(sandbox));
  return self.__swInternals as {
    CACHE_NAME: string;
    isExcludedPath: (pathname: string) => boolean;
    isImmutableAsset: (pathname: string) => boolean;
    isCacheableNavigation: (
      request: { method: string; mode: string; url: string },
      origin: string,
    ) => boolean;
    isProtectedPath: (pathname: string) => boolean;
    isSessionEndedRedirect: (
      response: { type: string },
      requestUrl: string,
    ) => boolean;
  };
}

const sw = loadServiceWorker();

const navigation = (url: string, overrides = {}) => ({
  method: 'GET',
  mode: 'navigate',
  url,
  ...overrides,
});

describe('isCacheableNavigation', () => {
  it('caches a trip page the user navigated to', () => {
    expect(
      sw.isCacheableNavigation(navigation(`${ORIGIN}/trips/abc`), ORIGIN),
    ).toBe(true);
  });

  it('refuses anything cross-origin', () => {
    // The structural guarantee that Mapbox tiles are never cached: their
    // device TTL is 12 hours and GL JS has no supported offline mode
    // (ADR-0015). Enforced by origin, not by a hostname list.
    expect(
      sw.isCacheableNavigation(
        navigation('https://api.mapbox.com/styles/v1/mapbox/streets-v12'),
        ORIGIN,
      ),
    ).toBe(false);
  });

  it('refuses non-GET requests', () => {
    expect(
      sw.isCacheableNavigation(
        navigation(`${ORIGIN}/trips/abc`, { method: 'POST' }),
        ORIGIN,
      ),
    ).toBe(false);
  });

  it('refuses sub-resource fetches, so RSC payloads and downloads pass through', () => {
    for (const mode of ['cors', 'no-cors', 'same-origin']) {
      expect(
        sw.isCacheableNavigation(
          navigation(`${ORIGIN}/trips/abc/calendar.ics`, { mode }),
          ORIGIN,
        ),
      ).toBe(false);
    }
  });

  it('refuses the auth routes', () => {
    expect(
      sw.isCacheableNavigation(
        navigation(`${ORIGIN}/api/auth/signin?callbackUrl=%2Ftrips`),
        ORIGIN,
      ),
    ).toBe(false);
  });

  it('refuses /settings and everything under it', () => {
    // The AI provider key UI. Excluded as a subtree so a future
    // /settings/<anything> is covered without editing sw.js again.
    expect(sw.isExcludedPath('/settings')).toBe(true);
    expect(sw.isExcludedPath('/settings/keys')).toBe(true);
    expect(
      sw.isCacheableNavigation(navigation(`${ORIGIN}/settings`), ORIGIN),
    ).toBe(false);
  });

  it('does not exclude paths that merely start with the same letters', () => {
    expect(sw.isExcludedPath('/settings-guide')).toBe(false);
    expect(sw.isExcludedPath('/apitrips')).toBe(false);
  });
});

describe('isImmutableAsset', () => {
  it('recognises content-hashed build output', () => {
    expect(sw.isImmutableAsset('/_next/static/chunks/main-abc123.js')).toBe(
      true,
    );
  });

  it('does not treat page routes as immutable', () => {
    expect(sw.isImmutableAsset('/trips/abc')).toBe(false);
    // /_next/image and /_next/data are NOT content-hashed.
    expect(sw.isImmutableAsset('/_next/image?url=%2Ficon-192.png')).toBe(false);
  });
});

describe('isSessionEndedRedirect', () => {
  // Measured, not assumed: a navigation Request carries redirect mode
  // "manual", so fetch() does not follow the 3xx. This is exactly what the
  // worker sees for this app's own sign-in redirect —
  // `{type: 'opaqueredirect', status: 0, ok: false, redirected: false,
  // url: '<the requested page>'}`. Note `redirected` is FALSE and the
  // destination is absent; an implementation that checked either would never
  // fire, which is the bug this test exists to prevent coming back.
  const OPAQUE_REDIRECT = { type: 'opaqueredirect' };

  it('detects a guarded page bounced by the auth proxy', () => {
    expect(
      sw.isSessionEndedRedirect(OPAQUE_REDIRECT, `${ORIGIN}/trips/abc`),
    ).toBe(true);
    expect(sw.isSessionEndedRedirect(OPAQUE_REDIRECT, `${ORIGIN}/trips`)).toBe(
      true,
    );
  });

  it('ignores an ordinary response', () => {
    expect(
      sw.isSessionEndedRedirect({ type: 'basic' }, `${ORIGIN}/trips/abc`),
    ).toBe(false);
  });

  it('does not drop the cache for a redirect on an unguarded route', () => {
    // Only src/proxy.ts's matcher implies "no session". A redirect anywhere
    // else means something different, and must not wipe someone's offline
    // itinerary as a side effect.
    expect(sw.isSessionEndedRedirect(OPAQUE_REDIRECT, `${ORIGIN}/`)).toBe(
      false,
    );
    expect(
      sw.isSessionEndedRedirect(OPAQUE_REDIRECT, `${ORIGIN}/shared/token`),
    ).toBe(false);
  });

  it('matches the proxy matcher, including near misses', () => {
    expect(sw.isProtectedPath('/trips')).toBe(true);
    expect(sw.isProtectedPath('/trips/abc/places')).toBe(true);
    expect(sw.isProtectedPath('/trips-archive')).toBe(false);
    expect(sw.isProtectedPath('/')).toBe(false);
  });
});
