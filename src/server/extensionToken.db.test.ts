import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import {
  createExtensionToken,
  getExtensionTokenStatus,
  identifyByExtensionToken,
  revokeExtensionToken,
} from './extensionToken';

// Real Postgres, only next-auth's session lookup stubbed — same rationale as
// places.db.test.ts. Worth running against a real database rather than mocks:
// the whole scheme rests on a @unique index over the hash column, and a mock
// returns whatever it was told regardless of whether that index exists.
vi.mock('../auth', () => ({ auth: vi.fn() }));

let userId: string;
let email: string;

beforeEach(async () => {
  email = `ext-token-${crypto.randomUUID()}@example.com`;
  const user = await db.user.create({ data: { email } });
  userId = user.id;
  vi.mocked(auth).mockResolvedValue({ user: { id: userId, email } } as never);
});

afterEach(async () => {
  await db.user.delete({ where: { id: userId } });
});

describe('extension tokens against a real database', () => {
  it('round-trips a freshly issued token back to its owner', async () => {
    const token = await createExtensionToken();

    expect(await identifyByExtensionToken(`Bearer ${token}`)).toEqual({
      userId,
      email,
    });
  });

  it('stores no trace of the plaintext token', async () => {
    const token = await createExtensionToken();

    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(JSON.stringify(row)).not.toContain(token);
    expect(row.extensionTokenHash).not.toBeNull();
    expect(row.extensionTokenCreatedAt).not.toBeNull();
  });

  it('invalidates the previous token when a new one is generated', async () => {
    const first = await createExtensionToken();
    const second = await createExtensionToken();

    // This is how a user rotates a leaked token, so it has to actually work
    // rather than leave two live credentials.
    expect(await identifyByExtensionToken(`Bearer ${first}`)).toBeNull();
    expect(await identifyByExtensionToken(`Bearer ${second}`)).not.toBeNull();
  });

  it('stops accepting a revoked token', async () => {
    const token = await createExtensionToken();
    await revokeExtensionToken();

    expect(await identifyByExtensionToken(`Bearer ${token}`)).toBeNull();
  });

  it('does not match one user with another user token', async () => {
    const otherEmail = `ext-other-${crypto.randomUUID()}@example.com`;
    const other = await db.user.create({ data: { email: otherEmail } });
    try {
      vi.mocked(auth).mockResolvedValue({
        user: { id: other.id, email: otherEmail },
      } as never);
      const otherToken = await createExtensionToken();

      vi.mocked(auth).mockResolvedValue({
        user: { id: userId, email },
      } as never);
      const myToken = await createExtensionToken();

      expect(await identifyByExtensionToken(`Bearer ${otherToken}`)).toEqual({
        userId: other.id,
        email: otherEmail,
      });
      expect(await identifyByExtensionToken(`Bearer ${myToken}`)).toEqual({
        userId,
        email,
      });
    } finally {
      await db.user.delete({ where: { id: other.id } });
    }
  });

  it('reports status without ever exposing the token', async () => {
    expect(await getExtensionTokenStatus()).toEqual({
      present: false,
      createdAt: null,
    });

    const token = await createExtensionToken();
    const status = await getExtensionTokenStatus();

    expect(status.present).toBe(true);
    expect(status.createdAt).toBeInstanceOf(Date);
    expect(JSON.stringify(status)).not.toContain(token);
  });

  it('leaves two users with no token both unmatched by a null hash', async () => {
    // Postgres treats every NULL in a unique index as distinct, so two
    // token-less users coexist — but a lookup must never resolve to one of
    // them either.
    const other = await db.user.create({
      data: { email: `ext-null-${crypto.randomUUID()}@example.com` },
    });
    try {
      expect(await identifyByExtensionToken('Bearer tp_nothing')).toBeNull();
    } finally {
      await db.user.delete({ where: { id: other.id } });
    }
  });
});
