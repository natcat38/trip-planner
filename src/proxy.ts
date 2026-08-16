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

export const config = {
  matcher: ['/trips/:path*'],
};
