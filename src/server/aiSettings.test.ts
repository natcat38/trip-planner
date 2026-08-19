import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decryptSecret, encryptSecret } from '../lib/crypto';
import { detectProvider, listModels, testKey } from '../lib/ai/provider';
import { db } from '../lib/db';
import { currentUserId, UnauthenticatedError } from './auth-scope';
import { ValidationError } from './errors';
import {
  deleteApiKey,
  getDecryptedKey,
  getKeyStatus,
  listAvailableModels,
  saveApiKey,
  setModel,
} from './aiSettings';

// Mocked as a plain factory so this never touches the real auth-scope.ts ->
// ../auth -> next-auth -> next/server chain — same rationale as trips.test.ts.
vi.mock('./auth-scope', () => {
  class UnauthenticatedError extends Error {
    constructor() {
      super('Not signed in.');
    }
  }
  return { currentUserId: vi.fn(), UnauthenticatedError };
});
vi.mock('../lib/db', () => ({
  db: {
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));
vi.mock('../lib/crypto', () => ({
  encryptSecret: vi.fn(),
  decryptSecret: vi.fn(),
}));
vi.mock('../lib/ai/provider', () => ({
  detectProvider: vi.fn(),
  listModels: vi.fn(),
  testKey: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(currentUserId).mockReset();
  vi.mocked(db.user.findUnique).mockReset();
  vi.mocked(db.user.update).mockReset();
  vi.mocked(encryptSecret).mockReset();
  vi.mocked(decryptSecret).mockReset();
  vi.mocked(detectProvider).mockReset();
  vi.mocked(listModels).mockReset();
  vi.mocked(testKey).mockReset();
});

const GROQ_KEY = 'gsk_realsecretvalue1234567890';
const encryptedParts = {
  ciphertext: 'cipher-b64',
  iv: 'iv-b64',
  tag: 'tag-b64',
};
const storedRow = {
  aiProvider: 'groq',
  aiKeyCiphertext: encryptedParts.ciphertext,
  aiKeyIv: encryptedParts.iv,
  aiKeyTag: encryptedParts.tag,
  aiModel: 'openai/gpt-oss-120b',
  aiKeyUpdatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

describe('every exported function refuses when currentUserId rejects', () => {
  const denied = new UnauthenticatedError();

  beforeEach(() => {
    vi.mocked(currentUserId).mockRejectedValue(denied);
  });

  it('getKeyStatus', async () => {
    await expect(getKeyStatus()).rejects.toBe(denied);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('saveApiKey', async () => {
    await expect(saveApiKey(GROQ_KEY)).rejects.toBe(denied);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('setModel', async () => {
    await expect(setModel('some-model')).rejects.toBe(denied);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('deleteApiKey', async () => {
    await expect(deleteApiKey()).rejects.toBe(denied);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('listAvailableModels', async () => {
    await expect(listAvailableModels()).rejects.toBe(denied);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it('getDecryptedKey', async () => {
    await expect(getDecryptedKey()).rejects.toBe(denied);
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });
});

describe('saveApiKey', () => {
  it('rejects an unrecognised prefix with ValidationError and writes nothing', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(detectProvider).mockReturnValue(null);

    await expect(saveApiKey('not-a-real-key')).rejects.toThrow(ValidationError);
    expect(testKey).not.toHaveBeenCalled();
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('rejects a key testKey reports as invalid, and writes nothing', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(detectProvider).mockReturnValue('groq');
    vi.mocked(testKey).mockResolvedValue({
      ok: false,
      reason: 'Key was rejected.',
    });

    await expect(saveApiKey(GROQ_KEY)).rejects.toThrow(ValidationError);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('encrypts and stores a verified key, clearing any previous model', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(detectProvider).mockReturnValue('groq');
    vi.mocked(testKey).mockResolvedValue({ ok: true });
    vi.mocked(encryptSecret).mockReturnValue(encryptedParts);
    vi.mocked(db.user.update).mockResolvedValue({} as never);

    await saveApiKey(GROQ_KEY);

    expect(encryptSecret).toHaveBeenCalledWith(GROQ_KEY);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        aiProvider: 'groq',
        aiKeyCiphertext: encryptedParts.ciphertext,
        aiKeyIv: encryptedParts.iv,
        aiKeyTag: encryptedParts.tag,
        aiModel: null,
      }),
    });
  });
});

describe('getKeyStatus', () => {
  it('never returns the plaintext key', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(db.user.findUnique).mockResolvedValue(storedRow as never);
    vi.mocked(decryptSecret).mockReturnValue(GROQ_KEY);

    const result = await getKeyStatus();

    expect(result).not.toBeNull();
    expect(JSON.stringify(result)).not.toContain(GROQ_KEY);
    expect(result?.maskedKey).not.toBe(GROQ_KEY);
  });

  it('returns provider/model/updatedAt alongside the mask', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(db.user.findUnique).mockResolvedValue(storedRow as never);
    vi.mocked(decryptSecret).mockReturnValue(GROQ_KEY);

    const result = await getKeyStatus();

    expect(result).toEqual(
      expect.objectContaining({
        provider: 'groq',
        model: 'openai/gpt-oss-120b',
        updatedAt: storedRow.aiKeyUpdatedAt,
      }),
    );
  });

  it('returns null when no key has ever been stored', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(db.user.findUnique).mockResolvedValue({
      aiProvider: null,
      aiKeyCiphertext: null,
      aiKeyIv: null,
      aiKeyTag: null,
      aiModel: null,
      aiKeyUpdatedAt: null,
    } as never);

    expect(await getKeyStatus()).toBeNull();
    expect(decryptSecret).not.toHaveBeenCalled();
  });

  it('returns null, not a throw, when the stored row fails to decrypt', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(db.user.findUnique).mockResolvedValue(storedRow as never);
    vi.mocked(decryptSecret).mockReturnValue(null);

    await expect(getKeyStatus()).resolves.toBeNull();
  });
});

describe('getDecryptedKey', () => {
  it('returns null, not a throw, when the stored row fails to decrypt', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(db.user.findUnique).mockResolvedValue(storedRow as never);
    vi.mocked(decryptSecret).mockReturnValue(null);

    await expect(getDecryptedKey()).resolves.toBeNull();
  });

  it('returns the decrypted key for a valid stored row', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(db.user.findUnique).mockResolvedValue(storedRow as never);
    vi.mocked(decryptSecret).mockReturnValue(GROQ_KEY);

    await expect(getDecryptedKey()).resolves.toEqual({
      key: GROQ_KEY,
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
    });
  });
});

describe('listAvailableModels', () => {
  it('returns null without calling the provider when no key is stored', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(db.user.findUnique).mockResolvedValue({
      aiProvider: null,
      aiKeyCiphertext: null,
      aiKeyIv: null,
      aiKeyTag: null,
      aiModel: null,
      aiKeyUpdatedAt: null,
    } as never);

    expect(await listAvailableModels()).toBeNull();
    expect(listModels).not.toHaveBeenCalled();
  });

  it('delegates to the provider lib with the decrypted key', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(db.user.findUnique).mockResolvedValue(storedRow as never);
    vi.mocked(decryptSecret).mockReturnValue(GROQ_KEY);
    vi.mocked(listModels).mockResolvedValue([
      { id: 'openai/gpt-oss-120b', free: true },
    ]);

    const result = await listAvailableModels();

    expect(listModels).toHaveBeenCalledWith(GROQ_KEY);
    expect(result).toEqual([{ id: 'openai/gpt-oss-120b', free: true }]);
  });
});

describe('setModel', () => {
  it('rejects a blank model', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');

    await expect(setModel('   ')).rejects.toThrow(ValidationError);
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it('stores the chosen model', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(db.user.update).mockResolvedValue({} as never);

    await setModel('openai/gpt-oss-120b');

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { aiModel: 'openai/gpt-oss-120b' },
    });
  });
});

describe('deleteApiKey', () => {
  it('clears all key fields', async () => {
    vi.mocked(currentUserId).mockResolvedValue('user-1');
    vi.mocked(db.user.update).mockResolvedValue({} as never);

    await deleteApiKey();

    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: {
        aiProvider: null,
        aiKeyCiphertext: null,
        aiKeyIv: null,
        aiKeyTag: null,
        aiModel: null,
        aiKeyUpdatedAt: null,
      },
    });
  });
});
