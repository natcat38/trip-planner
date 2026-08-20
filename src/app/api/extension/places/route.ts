/**
 * Saves a place to a trip from any webpage, on behalf of the browser
 * extension (Phase 3 M7, ADR-0017).
 *
 * Like the sibling trips route, `/api/*` is NOT in src/proxy.ts's matcher, so
 * this authenticates itself. Authorization for the trip itself still runs
 * through the app's single shared predicate (requireTripAccessForUser, inside
 * savePlaceFromPage) rather than a second copy of it.
 * @packageDocumentation
 */
import { NextResponse } from 'next/server';
import { savePlaceFromPage } from '@/server/extensionApi';
import { identifyByExtensionToken } from '@/server/extensionToken';
import { ForbiddenOrNotFoundError } from '@/server/auth-scope';
import { ValidationError } from '@/server/errors';

export async function POST(request: Request) {
  const identity = await identifyByExtensionToken(
    request.headers.get('authorization'),
  );
  if (!identity) {
    return NextResponse.json(
      { error: 'That token is not valid. Generate a new one in Settings.' },
      { status: 401 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Expected JSON.' }, { status: 400 });
  }
  // `null`, `[]`, `"str"` and `123` are all valid JSON, so parsing succeeding
  // does not mean there is an object to read fields off. Without this, a body
  // of literal `null` reaches `body.tripId` and throws — a 500 for what is
  // plainly a bad request.
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return NextResponse.json(
      { error: 'Expected a JSON object.' },
      { status: 400 },
    );
  }
  const fields = body as Record<string, unknown>;

  try {
    const place = await savePlaceFromPage(identity.userId, identity.email, {
      tripId: String(fields.tripId ?? ''),
      name: String(fields.name ?? ''),
      url: String(fields.url ?? ''),
      category: fields.category == null ? undefined : String(fields.category),
      notes: fields.notes == null ? undefined : String(fields.notes),
    });
    return NextResponse.json({ place: { id: place.id, name: place.name } });
  } catch (err) {
    // A trip the caller can't reach is reported as 404 with the same message
    // the app uses, so the response can't be used to enumerate trip ids.
    if (err instanceof ForbiddenOrNotFoundError) {
      return NextResponse.json({ error: err.message }, { status: 404 });
    }
    if (err instanceof ValidationError) {
      return NextResponse.json({ error: err.message }, { status: 422 });
    }
    throw err;
  }
}
