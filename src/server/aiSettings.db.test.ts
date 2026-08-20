import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { testKey } from '../lib/ai/provider';
import { db } from '../lib/db';
import { deleteApiKey, getDecryptedKey, saveApiKey } from './aiSettings';

// Real Postgres, only next-auth's session lookup stubbed and testKey's live
// network call stubbed (no network access in tests) — same rationale as
// places.db.test.ts. currentUserId, encryptSecret/decryptSecret, and every
// Prisma call run for real, which is the point: this suite exists to prove
// encryption at rest actually happens against a real row, not a mock.
vi.mock('../auth', () => ({ auth: vi.fn() }));
vi.mock('../lib/ai/provider', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/ai/provider')>();
  return { ...actual, testKey: vi.fn() };
});

let userId: string;

beforeEach(async () => {
  const user = await db.user.create({
    data: { email: `ai-settings-db-test-${crypto.randomUUID()}@example.com` },
  });
  userId = user.id;
  vi.mocked(auth).mockResolvedValue({ user: { id: userId } } as never);
  vi.mocked(testKey).mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await db.user.delete({ where: { id: userId } });
});

const GROQ_KEY = 'gsk_realsecretvalue1234567890abcdef';

describe('aiSettings against a real database', () => {
  it('round-trips a saved key through getDecryptedKey', async () => {
    await saveApiKey(GROQ_KEY);

    const decrypted = await getDecryptedKey();

    expect(decrypted).toEqual({
      key: GROQ_KEY,
      provider: 'groq',
      model: null,
    });
  });

  it('never stores the raw key in any column of the User row', async () => {
    await saveApiKey(GROQ_KEY);

    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });

    for (const value of Object.values(row)) {
      if (typeof value === 'string') {
        expect(value).not.toContain(GROQ_KEY);
      }
    }
  });

  it('deleteApiKey removes the stored key', async () => {
    await saveApiKey(GROQ_KEY);

    await deleteApiKey();

    expect(await getDecryptedKey()).toBeNull();
    const row = await db.user.findUniqueOrThrow({ where: { id: userId } });
    expect(row.aiProvider).toBeNull();
    expect(row.aiKeyCiphertext).toBeNull();
    expect(row.aiKeyIv).toBeNull();
    expect(row.aiKeyTag).toBeNull();
    expect(row.aiModel).toBeNull();
    expect(row.aiKeyUpdatedAt).toBeNull();
  });
});
