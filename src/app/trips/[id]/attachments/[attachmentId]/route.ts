/**
 * Downloads one trip attachment. Gated by requireTripAccess(tripId) inside
 * readAttachment, like every other nested resource (CLAUDE.md) — and the id in
 * the path is only ever resolved together with the trip, never on its own.
 *
 * Attachments are user-uploaded bytes served back from this app's own origin,
 * so the response headers here are a security boundary, not formatting. See
 * the comments on each one.
 * @packageDocumentation
 */
import { NextResponse } from 'next/server';
import { ForbiddenOrNotFoundError } from '@/server/auth-scope';
import { readAttachment } from '@/server/attachments';

// Strips everything non-alphanumeric except dot/dash/underscore, which is also
// what stops a CR or LF in a filename from injecting a response header. A
// wholly non-Latin name (領収書.pdf is an ordinary attachment on a Japan trip)
// survives that with nothing left, so fall back to something identifiable
// rather than serving a file called "-". Same approach as calendar.ics.
function downloadName(filename: string, mimeType: string): string {
  const cleaned = filename
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^[-.]+|-+$/g, '');
  if (cleaned) return cleaned;
  const extension = mimeType === 'application/pdf' ? 'pdf' : mimeType.slice(6);
  return `attachment.${extension}`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; attachmentId: string }> },
) {
  const { id, attachmentId } = await params;

  let attachment;
  try {
    attachment = await readAttachment(id, attachmentId);
  } catch (err) {
    if (err instanceof ForbiddenOrNotFoundError) {
      return new NextResponse(err.message, { status: 404 });
    }
    throw err;
  }

  return new NextResponse(new Uint8Array(attachment.data), {
    headers: {
      // Always one of the four sniffed, allowlisted types — readAttachment
      // re-checks before returning, so this can never echo a client-declared
      // content type.
      'Content-Type': attachment.mimeType,
      // `attachment` rather than `inline`: even with a correct content type,
      // nothing here needs to render in a top-level browsing context on this
      // origin, and a download can't run script against it.
      'Content-Disposition': `attachment; filename="${downloadName(attachment.filename, attachment.mimeType)}"`,
      // Belt and braces on the above — stops a browser sniffing the body and
      // deciding for itself that these bytes are HTML.
      'X-Content-Type-Options': 'nosniff',
      // These are private documents behind an auth check; no shared cache
      // should ever hold one.
      'Cache-Control': 'private, no-store',
    },
  });
}
