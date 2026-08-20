import { NextResponse } from 'next/server';
import { auth } from './auth';

// Next.js 16 renamed middleware.ts -> proxy.ts (middleware file convention deprecated).
export const proxy = auth((req) => {
  if (!req.auth) {
    const signInUrl = new URL('/api/auth/signin', req.nextUrl.origin);
    signInUrl.searchParams.set('callbackUrl', req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }
});

// Every authenticated route must be listed here. A route that isn't matched is
// simply public — the proxy never runs for it, and nothing else in the app
// re-checks at the routing layer. `/settings` holds encrypted provider API keys,
// so it was added here BEFORE that route existed rather than after
// (docs/phase-3-research-layer-handoff.md §3.6). The in-action currentUserId()
// guard in src/server/aiSettings.ts is the defence-in-depth behind this line,
// not a substitute for it.
export const config = {
  matcher: ['/trips/:path*', '/settings/:path*', '/settings'],
};
