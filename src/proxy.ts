import { NextResponse } from 'next/server';
import { auth } from './auth';

// Next.js 16 renamed middleware.ts -> proxy.ts (middleware file convention deprecated).
export const proxy = auth((req) => {
  if (!req.auth) {
    return NextResponse.redirect(
      new URL('/api/auth/signin', req.nextUrl.origin),
    );
  }
});

export const config = {
  matcher: ['/trips/:path*'],
};
