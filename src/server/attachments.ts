/**
 * Trip attachments (Phase 3 M6, ADR-0016): booking confirmations, tickets and
 * screenshots stored as Postgres `bytea` beside the trip they belong to.
 * Mirrors src/server/checklist.ts's shape and authorization pattern.
 *
 * Deliberately NOT a `'use server'` module, for the same reason as
 * src/server/aiSettings.ts: that directive publishes every export as a public
 * HTTP endpoint, and `readAttachment` returns raw file bytes. It is gated by
 * requireTripAccess either way, so this is about not creating surface that
 * nothing needs — the Server Actions live in src/app/trips/[id]/actions.ts and
 * the download route imports this directly.
 *
 * Attachments are never exposed on `/shared/[token]` (CLAUDE.md): the whole
 * category is documents you would not hand to a stranger with a link.
 * @packageDocumentation
 */

import { formatBytes } from '../lib/bytes';
import { db } from '../lib/db';
import {
  currentUserEmail,
  requireTripAccess,
  ForbiddenOrNotFoundError,
  UnauthenticatedError,
} from './auth-scope';
import { ValidationError } from './errors';

// Vercel rejects any function request OR response body over 4.5 MB with a 413,
// so no attachment can be larger than that whatever this file says. 4 MB
// leaves room for the multipart boundaries and part headers that a form upload
// adds on top of the file itself.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Neon's free plan caps this ENTIRE database at 0.5 GB — trips, days,
// activities, expenses and attachments together. A generous per-trip
// allowance would let a handful of trips exhaust the whole project, so this is
// sized for the actual use case (a few confirmations and tickets per trip)
// rather than for what a file picker makes it easy to select.
export const MAX_TRIP_BYTES = 20 * 1024 * 1024;

// A filename is displayed and echoed into a Content-Disposition header; an
// unbounded one is just a way to make a page unreadable.
const MAX_FILENAME_LENGTH = 200;

// The content type is decided HERE by inspecting the bytes, never taken from
// the upload's declared type — a browser sends whatever the client claims, and
// "image/png" on a file full of HTML would otherwise be stored as fact.
// Formats a traveller actually has: photos of tickets, and PDF confirmations.
const MAGIC_BYTES: {
  mimeType: string;
  matches: (bytes: Uint8Array) => boolean;
}[] = [
  {
    mimeType: 'image/jpeg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mimeType: 'image/png',
    matches: (b) =>
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47 &&
      b[4] === 0x0d &&
      b[5] === 0x0a &&
      b[6] === 0x1a &&
      b[7] === 0x0a,
  },
  {
    mimeType: 'image/webp',
    // "RIFF" .... "WEBP" — the four size bytes in between are the payload
    // length, so both halves have to be checked.
    matches: (b) =>
      b[0] === 0x52 &&
      b[1] === 0x49 &&
      b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 &&
      b[9] === 0x45 &&
      b[10] === 0x42 &&
      b[11] === 0x50,
  },
  {
    mimeType: 'application/pdf',
    // "%PDF-"
    matches: (b) =>
      b[0] === 0x25 &&
      b[1] === 0x50 &&
      b[2] === 0x44 &&
      b[3] === 0x46 &&
      b[4] === 0x2d,
  },
];

export const ALLOWED_MIME_TYPES = MAGIC_BYTES.map((entry) => entry.mimeType);

// Returns the type the bytes actually are, or null if they aren't one of the
// four allowed formats. Exported for the test suite, which asserts against
// real file headers rather than the constants above.
export function sniffMimeType(bytes: Uint8Array): string | null {
  // Every signature above reads at most 12 bytes; anything shorter can't match
  // one and would read `undefined` out of the array instead.
  if (bytes.length < 12) return null;
  return MAGIC_BYTES.find((entry) => entry.matches(bytes))?.mimeType ?? null;
}

async function currentUserEmailOrNull(): Promise<string | null> {
  // requireTripAccess authorises an owner on userId alone, so a session with
  // no email is still a legitimate uploader — provenance must not block the
  // upload. Same reasoning as src/server/votes.ts.
  try {
    return await currentUserEmail();
  } catch (err) {
    if (err instanceof UnauthenticatedError) return null;
    throw err;
  }
}

export interface AttachmentSummary {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string | null;
  createdAt: Date;
}

export interface AttachmentUsage {
  usedBytes: number;
  remainingBytes: number;
  maxTripBytes: number;
  maxFileBytes: number;
}

// `data` is excluded from the select on purpose, and this is the reason the
// summary type is spelled out by hand rather than inferred: listing a trip's
// attachments must never pull megabytes of file bodies into memory to render a
// list of filenames.
export async function listAttachments(
  tripId: string,
): Promise<AttachmentSummary[]> {
  const trip = await requireTripAccess(tripId);
  return db.attachment.findMany({
    where: { tripId: trip.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      filename: true,
      mimeType: true,
      sizeBytes: true,
      uploadedBy: true,
      createdAt: true,
    },
  });
}

export async function getAttachmentUsage(
  tripId: string,
): Promise<AttachmentUsage> {
  const trip = await requireTripAccess(tripId);
  const total = await db.attachment.aggregate({
    where: { tripId: trip.id },
    _sum: { sizeBytes: true },
  });
  const usedBytes = total._sum.sizeBytes ?? 0;
  return {
    usedBytes,
    remainingBytes: Math.max(0, MAX_TRIP_BYTES - usedBytes),
    maxTripBytes: MAX_TRIP_BYTES,
    maxFileBytes: MAX_FILE_BYTES,
  };
}

export async function addAttachment(tripId: string, file: File): Promise<void> {
  const trip = await requireTripAccess(tripId);

  if (!file || file.size === 0) {
    throw new ValidationError('Choose a file to upload.');
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new ValidationError(
      `That file is ${formatBytes(file.size)}. The limit is ${formatBytes(MAX_FILE_BYTES)} per file.`,
    );
  }

  const bytes = new Uint8Array(await file.arrayBuffer());

  // Checked against the bytes read, not file.size: the two can disagree, and
  // the one that lands in the database is the one that matters.
  if (bytes.byteLength > MAX_FILE_BYTES) {
    throw new ValidationError(
      `That file is ${formatBytes(bytes.byteLength)}. The limit is ${formatBytes(MAX_FILE_BYTES)} per file.`,
    );
  }

  const mimeType = sniffMimeType(bytes);
  if (!mimeType) {
    throw new ValidationError(
      'Only JPEG, PNG, WebP and PDF files can be attached.',
    );
  }

  // Read after the file is validated but before the insert. Two uploads racing
  // can both pass this and land slightly over the cap; the cost of that is a
  // few megabytes, and the alternative — a serialisable transaction per upload
  // — buys precision nobody is measuring.
  const { remainingBytes } = await getAttachmentUsage(trip.id);
  if (bytes.byteLength > remainingBytes) {
    throw new ValidationError(
      `This trip has ${formatBytes(remainingBytes)} of attachment space left (${formatBytes(MAX_TRIP_BYTES)} total). Delete something first.`,
    );
  }

  const filename = (file.name || 'attachment').slice(0, MAX_FILENAME_LENGTH);

  await db.attachment.create({
    data: {
      tripId: trip.id,
      filename,
      mimeType,
      sizeBytes: bytes.byteLength,
      data: Buffer.from(bytes),
      uploadedBy: await currentUserEmailOrNull(),
    },
  });
}

export async function deleteAttachment(
  tripId: string,
  attachmentId: string,
): Promise<void> {
  // Scoped by tripId as well as id, per CLAUDE.md — a nested resource is never
  // reachable by its own id alone.
  const trip = await requireTripAccess(tripId);
  const result = await db.attachment.deleteMany({
    where: { id: attachmentId, tripId: trip.id },
  });
  if (result.count === 0) throw new ForbiddenOrNotFoundError();
}

export interface AttachmentDownload {
  filename: string;
  mimeType: string;
  data: Uint8Array;
}

export async function readAttachment(
  tripId: string,
  attachmentId: string,
): Promise<AttachmentDownload> {
  const trip = await requireTripAccess(tripId);
  const attachment = await db.attachment.findFirst({
    where: { id: attachmentId, tripId: trip.id },
  });
  if (!attachment) throw new ForbiddenOrNotFoundError();

  // addAttachment only ever writes a sniffed, allowlisted type, so this can
  // only fail if a row was written by something other than this module. It
  // still gets checked, because the consequence of being wrong is serving
  // attacker-controlled bytes as an active content type on this origin.
  if (!ALLOWED_MIME_TYPES.includes(attachment.mimeType)) {
    throw new ForbiddenOrNotFoundError();
  }

  return {
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    data: attachment.data,
  };
}
