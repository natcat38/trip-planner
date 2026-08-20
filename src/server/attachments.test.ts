import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { ForbiddenOrNotFoundError, requireTripAccess } from './auth-scope';
import { ValidationError } from './errors';
import {
  addAttachment,
  deleteAttachment,
  getAttachmentUsage,
  listAttachments,
  MAX_FILE_BYTES,
  MAX_TRIP_BYTES,
  readAttachment,
  sniffMimeType,
} from './attachments';

// Mocked as a plain factory (not importOriginal) so this never touches the
// real auth-scope.ts -> ../auth -> next-auth -> next/server chain — same
// rationale as places.test.ts / votes.test.ts.
vi.mock('./auth-scope', () => {
  class ForbiddenOrNotFoundError extends Error {
    constructor() {
      super("That trip doesn't exist or you don't have access.");
    }
  }
  class UnauthenticatedError extends Error {}
  return {
    requireTripAccess: vi.fn(),
    currentUserEmail: vi.fn(async () => 'me@example.com'),
    ForbiddenOrNotFoundError,
    UnauthenticatedError,
  };
});
vi.mock('../lib/db', () => ({
  db: {
    attachment: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      aggregate: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.mocked(requireTripAccess).mockReset();
  vi.mocked(requireTripAccess).mockResolvedValue({ id: 'trip-1' } as never);
  vi.mocked(db.attachment.findMany).mockReset();
  vi.mocked(db.attachment.findFirst).mockReset();
  vi.mocked(db.attachment.aggregate).mockReset();
  vi.mocked(db.attachment.create).mockReset();
  vi.mocked(db.attachment.deleteMany).mockReset();
  vi.mocked(db.attachment.aggregate).mockResolvedValue({
    _sum: { sizeBytes: 0 },
  } as never);
});

// Real file headers, not the constants from the module under test — a test
// built from the same table it is checking would pass even if the table were
// wrong.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13];
const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1];
const WEBP = [0x52, 0x49, 0x46, 0x46, 40, 0, 0, 0, 0x57, 0x45, 0x42, 0x50];
const PDF = [
  0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 10, 37, 0xe2, 0xe3,
];
const HTML = [...Buffer.from('<html><script>alert(1)</script>')];

function fileOf(bytes: number[], name: string, declaredType: string): File {
  return new File([new Uint8Array(bytes)], name, { type: declaredType });
}

describe('sniffMimeType', () => {
  it('recognises each allowed format from its own header bytes', () => {
    expect(sniffMimeType(new Uint8Array(PNG))).toBe('image/png');
    expect(sniffMimeType(new Uint8Array(JPEG))).toBe('image/jpeg');
    expect(sniffMimeType(new Uint8Array(WEBP))).toBe('image/webp');
    expect(sniffMimeType(new Uint8Array(PDF))).toBe('application/pdf');
  });

  it('refuses anything else', () => {
    expect(sniffMimeType(new Uint8Array(HTML))).toBeNull();
    expect(sniffMimeType(new Uint8Array(12))).toBeNull();
  });

  it('refuses a file too short to carry a signature rather than reading past its end', () => {
    // RIFF's WEBP marker lives at byte 8; a 4-byte file would read undefined
    // out of the array and could match by accident.
    expect(sniffMimeType(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });

  it('does not mistake a truncated RIFF container for WebP', () => {
    // A RIFF/WAVE file: same first four bytes, different format marker.
    const wav = [0x52, 0x49, 0x46, 0x46, 40, 0, 0, 0, 0x57, 0x41, 0x56, 0x45];
    expect(sniffMimeType(new Uint8Array(wav))).toBeNull();
  });
});

describe('every exported function refuses when authorization rejects', () => {
  const denied = new ForbiddenOrNotFoundError();

  beforeEach(() => {
    vi.mocked(requireTripAccess).mockRejectedValue(denied);
  });

  it('listAttachments refuses', async () => {
    await expect(listAttachments('trip-1')).rejects.toBe(denied);
    expect(db.attachment.findMany).not.toHaveBeenCalled();
  });

  it('getAttachmentUsage refuses', async () => {
    await expect(getAttachmentUsage('trip-1')).rejects.toBe(denied);
    expect(db.attachment.aggregate).not.toHaveBeenCalled();
  });

  it('addAttachment refuses before reading the file', async () => {
    await expect(
      addAttachment('trip-1', fileOf(PNG, 'a.png', 'image/png')),
    ).rejects.toBe(denied);
    expect(db.attachment.create).not.toHaveBeenCalled();
  });

  it('deleteAttachment refuses', async () => {
    await expect(deleteAttachment('trip-1', 'att-1')).rejects.toBe(denied);
    expect(db.attachment.deleteMany).not.toHaveBeenCalled();
  });

  it('readAttachment refuses', async () => {
    await expect(readAttachment('trip-1', 'att-1')).rejects.toBe(denied);
    expect(db.attachment.findFirst).not.toHaveBeenCalled();
  });
});

describe('addAttachment', () => {
  it('stores the type read from the bytes, not the type the client declared', async () => {
    vi.mocked(db.attachment.create).mockResolvedValue({} as never);

    // A PDF that claims to be a PNG. The browser sends whatever the client
    // says; only the bytes are evidence.
    await addAttachment('trip-1', fileOf(PDF, 'ticket.pdf', 'image/png'));

    expect(db.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ mimeType: 'application/pdf' }),
      }),
    );
  });

  it('rejects HTML dressed up as an image', async () => {
    // The attack this guards: an uploaded text/html served back from this
    // app's own origin would be same-origin script.
    await expect(
      addAttachment('trip-1', fileOf(HTML, 'photo.png', 'image/png')),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.attachment.create).not.toHaveBeenCalled();
  });

  it('rejects an empty file', async () => {
    await expect(
      addAttachment('trip-1', fileOf([], 'empty.png', 'image/png')),
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a file over the per-file cap', async () => {
    const oversized = [...PNG, ...new Array(MAX_FILE_BYTES).fill(0)];
    await expect(
      addAttachment('trip-1', fileOf(oversized, 'big.png', 'image/png')),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.attachment.create).not.toHaveBeenCalled();
  });

  it('rejects a file that would exceed the per-trip cap', async () => {
    vi.mocked(db.attachment.aggregate).mockResolvedValue({
      _sum: { sizeBytes: MAX_TRIP_BYTES },
    } as never);

    await expect(
      addAttachment('trip-1', fileOf(PNG, 'one-more.png', 'image/png')),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(db.attachment.create).not.toHaveBeenCalled();
  });

  it('records the size actually read, not the size the client reported', async () => {
    vi.mocked(db.attachment.create).mockResolvedValue({} as never);

    await addAttachment('trip-1', fileOf(PNG, 'a.png', 'image/png'));

    expect(db.attachment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ sizeBytes: PNG.length }),
      }),
    );
  });

  it('truncates an absurdly long filename instead of storing it whole', async () => {
    vi.mocked(db.attachment.create).mockResolvedValue({} as never);

    await addAttachment(
      'trip-1',
      fileOf(PNG, `${'a'.repeat(5000)}.png`, 'image/png'),
    );

    const call = vi.mocked(db.attachment.create).mock.calls[0][0] as {
      data: { filename: string };
    };
    expect(call.data.filename.length).toBeLessThanOrEqual(200);
  });
});

describe('listAttachments', () => {
  it('never selects the file bodies', async () => {
    vi.mocked(db.attachment.findMany).mockResolvedValue([] as never);

    await listAttachments('trip-1');

    const call = vi.mocked(db.attachment.findMany).mock.calls[0][0] as {
      select: Record<string, boolean>;
      where: unknown;
    };
    // Listing a trip's attachments must not pull megabytes of file bodies
    // into memory to render a list of filenames.
    expect(call.select.data).toBeUndefined();
    expect(call.select.filename).toBe(true);
    expect(call.where).toEqual({ tripId: 'trip-1' });
  });
});

describe('deleteAttachment', () => {
  it('scopes the delete to the trip, not the attachment id alone', async () => {
    vi.mocked(db.attachment.deleteMany).mockResolvedValue({
      count: 1,
    } as never);

    await deleteAttachment('trip-1', 'att-1');

    expect(db.attachment.deleteMany).toHaveBeenCalledWith({
      where: { id: 'att-1', tripId: 'trip-1' },
    });
  });

  it('reports an attachment belonging to another trip as not found', async () => {
    vi.mocked(db.attachment.deleteMany).mockResolvedValue({
      count: 0,
    } as never);

    await expect(deleteAttachment('trip-1', 'att-1')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});

describe('readAttachment', () => {
  it('returns the stored bytes for an attachment on this trip', async () => {
    vi.mocked(db.attachment.findFirst).mockResolvedValue({
      filename: 'ticket.pdf',
      mimeType: 'application/pdf',
      data: Buffer.from(PDF),
    } as never);

    const result = await readAttachment('trip-1', 'att-1');

    expect(result.mimeType).toBe('application/pdf');
    expect(db.attachment.findFirst).toHaveBeenCalledWith({
      where: { id: 'att-1', tripId: 'trip-1' },
    });
  });

  it('refuses to serve a row whose stored type is not on the allowlist', async () => {
    // addAttachment can only ever write a sniffed, allowlisted type, so this
    // is unreachable through the app. It is checked anyway because the
    // consequence of being wrong is serving attacker-controlled bytes as an
    // active content type on this origin.
    vi.mocked(db.attachment.findFirst).mockResolvedValue({
      filename: 'evil.html',
      mimeType: 'text/html',
      data: Buffer.from(HTML),
    } as never);

    await expect(readAttachment('trip-1', 'att-1')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});
