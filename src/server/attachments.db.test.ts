import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import {
  addAttachment,
  getAttachmentUsage,
  listAttachments,
  readAttachment,
} from './attachments';

// Real Postgres, only next-auth's session lookup stubbed — same rationale as
// places.db.test.ts. The point of running these against a real database is
// bytea: a mock will happily hand back whatever Buffer it was given, so it
// cannot show whether file bytes survive a round trip through Postgres and
// Prisma unchanged.
vi.mock('../auth', () => ({ auth: vi.fn() }));

let userId: string;
let tripId: string;

// A real 1x1 PNG, not a header fragment — the bytes below are what a browser
// would actually upload.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

beforeEach(async () => {
  const user = await db.user.create({
    data: { email: `attachments-db-test-${crypto.randomUUID()}@example.com` },
  });
  userId = user.id;
  vi.mocked(auth).mockResolvedValue({
    user: { id: userId, email: `owner-${userId}@example.com` },
  } as never);

  const trip = await db.trip.create({
    data: {
      userId,
      name: 'Japan Trip',
      destinations: ['Fukuoka'],
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-01'),
      baseCurrency: 'JPY',
      budgetMinor: 0,
    },
  });
  tripId = trip.id;
});

afterEach(async () => {
  await db.trip.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
});

describe('attachments against a real database', () => {
  it('round-trips file bytes through bytea unchanged', async () => {
    await addAttachment(
      tripId,
      new File([new Uint8Array(PNG_1X1)], 'pin.png', { type: 'image/png' }),
    );

    const [summary] = await listAttachments(tripId);
    const downloaded = await readAttachment(tripId, summary.id);

    expect(Buffer.from(downloaded.data)).toEqual(PNG_1X1);
    expect(downloaded.mimeType).toBe('image/png');
    expect(summary.sizeBytes).toBe(PNG_1X1.byteLength);
  });

  it('tracks per-trip usage across several files', async () => {
    for (const name of ['a.png', 'b.png']) {
      await addAttachment(
        tripId,
        new File([new Uint8Array(PNG_1X1)], name, { type: 'image/png' }),
      );
    }

    const usage = await getAttachmentUsage(tripId);

    expect(usage.usedBytes).toBe(PNG_1X1.byteLength * 2);
    expect(usage.remainingBytes).toBe(usage.maxTripBytes - usage.usedBytes);
  });

  it('reports zero usage for a trip with no attachments', async () => {
    // aggregate's _sum is null, not 0, when nothing matches — the coalesce in
    // getAttachmentUsage is what keeps this from being NaN on the page.
    const usage = await getAttachmentUsage(tripId);

    expect(usage.usedBytes).toBe(0);
    expect(usage.remainingBytes).toBe(usage.maxTripBytes);
  });

  it('cascade-deletes attachments when the parent trip is deleted', async () => {
    await addAttachment(
      tripId,
      new File([new Uint8Array(PNG_1X1)], 'pin.png', { type: 'image/png' }),
    );

    await db.trip.delete({ where: { id: tripId } });

    expect(await db.attachment.count({ where: { tripId } })).toBe(0);
  });

  it('records the uploader from the session, never from the caller', async () => {
    await addAttachment(
      tripId,
      new File([new Uint8Array(PNG_1X1)], 'pin.png', { type: 'image/png' }),
    );

    // Read from the column, not from listAttachments: provenance is stored,
    // but deliberately not shipped to the client (ADR-0014's reasoning about
    // collaborator emails), so the summary below must NOT carry it.
    const row = await db.attachment.findFirstOrThrow({ where: { tripId } });
    expect(row.uploadedBy).toBe(`owner-${userId}@example.com`);

    const [summary] = await listAttachments(tripId);
    expect(summary).not.toHaveProperty('uploadedBy');
  });
});
