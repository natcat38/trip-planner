/**
 * Lists the caller's trips for the browser extension's trip picker
 * (Phase 3 M7, ADR-0017).
 *
 * `/api/*` is NOT in src/proxy.ts's matcher, so this route is reachable
 * without a session and authenticates itself. `identifyByExtensionToken` is
 * the only thing between an anonymous request and a user's trips — the same
 * property `/shared/[token]` has, and it is deliberate in both cases.
 * @packageDocumentation
 */
import { NextResponse } from 'next/server';
import { listTripsForExtension } from '@/server/extensionApi';
import { identifyByExtensionToken } from '@/server/extensionToken';

export async function GET(request: Request) {
  const identity = await identifyByExtensionToken(
    request.headers.get('authorization'),
  );
  if (!identity) {
    return NextResponse.json(
      { error: 'That token is not valid. Generate a new one in Settings.' },
      { status: 401 },
    );
  }

  const trips = await listTripsForExtension(identity.userId, identity.email);
  return NextResponse.json(
    { trips },
    // A user's trip list behind a bearer token: never a shared cache.
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
