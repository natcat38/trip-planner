import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { currentUserId } from './auth-scope';
import {
  createExtensionToken,
  identifyByExtensionToken,
  revokeExtensionToken,
} from './extensionToken';

// Mocked as a plain factory (not importOriginal) so this never touches the
// real auth-scope.ts -> ../auth -> next-auth -> next/server chain — same
// rationale as places.test.ts / attachments.test.ts.
vi.mock('./auth-scope', () => {
  class UnauthenticatedError extends Error {}
  return { currentUserId: vi.fn(), UnauthenticatedError };
});
vi.mock('../lib/db', () => ({
  db: { user: { findUnique: vi.fn(), update: vi.fn() } },
}));

beforeEach(() => {
  vi.mocked(currentUserId).mockReset();
  vi.mocked(currentUserId).mockResolvedValue('user-1');
  vi.mocked(db.user.findUnique).mockReset();
  vi.mocked(db.user.update).mockReset();
  vi.mocked(db.user.update).mockResolvedValue({} as never);
});

describe('createExtensionToken', () => {
  it('never stores the token itself, only a hash of it', async () => {
    const token = await createExtensionToken();

    const call = vi.mocked(db.user.update).mock.calls[0][0] as {
      data: { extensionTokenHash: string };
    };
    // The whole point of hashing rather than encrypting: there is no path
    // back to this value, so a database dump does not yield working tokens.
    expect(call.data.extensionTokenHash).not.toBe(token);
    expect(call.data.extensionTokenHash).not.toContain(token);
    expect(call.data.extensionTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('issues a prefixed, high-entropy token', async () => {
    const token = await createExtensionToken();

    expect(token.startsWith('tp_')).toBe(true);
    // 32 random bytes in base64url — long enough that guessing is not a
    // threat model, which is what justifies a fast hash.
    expect(token.length).toBeGreaterThan(40);
  });

  it('issues a different token every time', async () => {
    const first = await createExtensionToken();
    const second = await createExtensionToken();

    expect(first).not.toBe(second);
  });

  it('refuses when there is no session', async () => {
    const denied = new Error('Not signed in.');
    vi.mocked(currentUserId).mockRejectedValue(denied);

    await expect(createExtensionToken()).rejects.toBe(denied);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe('revokeExtensionToken', () => {
  it('clears both columns', async () => {
    await revokeExtensionToken();

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { extensionTokenHash: null, extensionTokenCreatedAt: null },
    });
  });

  it('refuses when there is no session', async () => {
    const denied = new Error('Not signed in.');
    vi.mocked(currentUserId).mockRejectedValue(denied);

    await expect(revokeExtensionToken()).rejects.toBe(denied);
    expect(db.user.update).not.toHaveBeenCalled();
  });
});

describe('identifyByExtensionToken', () => {
  // This function is the only thing between an anonymous HTTP request and a
  // user's trips: /api/extension/* is NOT in src/proxy.ts's matcher. Every
  // case below is a way in if it returned an identity by mistake.
  const rejected = [
    ['a missing header', null],
    ['an empty header', ''],
    ['a bare token with no scheme', 'tp_abc'],
    ['the wrong scheme', 'Basic tp_abc'],
    ['a lowercase scheme', 'bearer tp_abc'],
    ['a token without the prefix', 'Bearer abc'],
    ['an empty bearer value', 'Bearer '],
  ] as const;

  for (const [description, header] of rejected) {
    it(`rejects ${description}`, async () => {
      expect(await identifyByExtensionToken(header)).toBeNull();
    });
  }

  it('never queries the database for a malformed header', async () => {
    await identifyByExtensionToken('Basic tp_abc');
    // Cheap, but the point is that an unauthenticated caller can't make this
    // endpoint do database work by sending junk.
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a well-formed token that matches no user', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    expect(await identifyByExtensionToken('Bearer tp_nope')).toBeNull();
  });

  it('rejects a user row whose token was revoked', async () => {
    // Belt and braces: the query is by hash so a null hash shouldn't match,
    // but a revoked token must never resolve even if it somehow got here.
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'me@example.com',
      extensionTokenHash: null,
    } as never);

    expect(await identifyByExtensionToken('Bearer tp_revoked')).toBeNull();
  });

  it('looks the user up by hash, never by the raw token', async () => {
    vi.mocked(db.user.findUnique).mockResolvedValue(null);

    await identifyByExtensionToken('Bearer tp_secret-value');

    const call = vi.mocked(db.user.findUnique).mock.calls[0][0] as {
      where: { extensionTokenHash: string };
    };
    expect(call.where.extensionTokenHash).not.toContain('secret-value');
    expect(call.where.extensionTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('returns the identity including a lowercased email', async () => {
    // The email is what makes collaborator access work (ADR-0006), and
    // TripCollaborator rows store lowercase.
    const { createHash } = await import('node:crypto');
    const token = 'tp_good';
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: 'Me@Example.COM',
      extensionTokenHash: createHash('sha256').update(token).digest('hex'),
    } as never);

    expect(await identifyByExtensionToken(`Bearer ${token}`)).toEqual({
      userId: 'user-1',
      email: 'me@example.com',
    });
  });

  it('returns an undefined email rather than failing when the user has none', async () => {
    const { createHash } = await import('node:crypto');
    const token = 'tp_good';
    vi.mocked(db.user.findUnique).mockResolvedValue({
      id: 'user-1',
      email: null,
      extensionTokenHash: createHash('sha256').update(token).digest('hex'),
    } as never);

    expect(await identifyByExtensionToken(`Bearer ${token}`)).toEqual({
      userId: 'user-1',
      email: undefined,
    });
  });
});
