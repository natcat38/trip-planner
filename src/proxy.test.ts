import { describe, expect, it, vi } from 'vitest';

// proxy.ts calls auth() at module scope, which drags next-auth (and its
// `next/server` import, unresolvable under vitest's node environment) into the
// module graph. Same `vi.mock('./auth')` approach the .db.test.ts suites use.
vi.mock('./auth', () => ({ auth: (handler: unknown) => handler }));

const { config } = await import('./proxy');

// The matcher IS the auth boundary for page routes: an unmatched path never
// runs the proxy and is therefore public. That failure mode is silent — the
// page renders fine, it just renders for anyone — so it gets a test rather
// than a code review.
describe('proxy matcher', () => {
  // Mirrors Next's path-to-regexp matching closely enough to catch a route
  // dropping out of the matcher, without pulling in the real matcher internals.
  function isMatched(pathname: string): boolean {
    return config.matcher.some((pattern) => {
      const source = pattern.replace(/\/:path\*/g, '(?:/.*)?');
      return new RegExp(`^${source}$`).test(pathname);
    });
  }

  it('covers /settings, which holds encrypted provider API keys', () => {
    expect(isMatched('/settings')).toBe(true);
    expect(isMatched('/settings/ai')).toBe(true);
  });

  it('still covers the trip routes', () => {
    expect(isMatched('/trips')).toBe(true);
    expect(isMatched('/trips/abc123')).toBe(true);
    expect(isMatched('/trips/abc123/places')).toBe(true);
  });

  it('leaves the public share route and sign-in unmatched', () => {
    // /shared/[token] is deliberately the one route with no auth gate
    // (CLAUDE.md) — matching it here would break public share links.
    expect(isMatched('/shared/some-token')).toBe(false);
    expect(isMatched('/api/auth/signin')).toBe(false);
    expect(isMatched('/')).toBe(false);
  });
});
