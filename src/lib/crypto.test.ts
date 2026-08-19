import { beforeEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto';

// Test-only keys — not secrets, just fixed 32-byte base64 values so the
// round-trip and key-rotation tests are deterministic.
const TEST_KEY = 'PoqZYWqpWiPGpCdqm60yJMrT0TiMh9PVJ6yvUaKd97s=';
const OTHER_KEY = 'k7X2n9QvL4mZ8pT1rY6wB0hC3sD5fJ2eN9uV7aK1oXg=';

beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

describe('encryptSecret / decryptSecret', () => {
  it('round-trips a plaintext string exactly', () => {
    const plaintext = 'sk-super-secret-provider-key-12345';
    const encrypted = encryptSecret(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('round-trips non-ASCII plaintext exactly', () => {
    const plaintext = '日本語のAPIキー 🔑 café';
    const encrypted = encryptSecret(plaintext);
    expect(decryptSecret(encrypted)).toBe(plaintext);
  });

  it('produces different ciphertext and IV for two encryptions of the same plaintext', () => {
    const plaintext = 'sk-same-plaintext-both-times';
    const first = encryptSecret(plaintext);
    const second = encryptSecret(plaintext);

    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
    // Both must still independently decrypt to the same plaintext.
    expect(decryptSecret(first)).toBe(plaintext);
    expect(decryptSecret(second)).toBe(plaintext);
  });

  it('returns null when the ciphertext has been tampered with', () => {
    const encrypted = encryptSecret('sk-tamper-target');
    const tamperedByte = Buffer.from(encrypted.ciphertext, 'base64');
    tamperedByte[0] = tamperedByte[0] ^ 0xff;
    const tampered = {
      ...encrypted,
      ciphertext: tamperedByte.toString('base64'),
    };

    expect(decryptSecret(tampered)).toBeNull();
  });

  it('returns null when the auth tag has been tampered with', () => {
    const encrypted = encryptSecret('sk-tag-tamper-target');
    const tamperedTag = Buffer.from(encrypted.tag, 'base64');
    tamperedTag[0] = tamperedTag[0] ^ 0xff;
    const tampered = { ...encrypted, tag: tamperedTag.toString('base64') };

    expect(decryptSecret(tampered)).toBeNull();
  });

  it('returns null when decrypting with a different ENCRYPTION_KEY (key rotation)', () => {
    const encrypted = encryptSecret('sk-rotation-target');
    process.env.ENCRYPTION_KEY = OTHER_KEY;

    expect(decryptSecret(encrypted)).toBeNull();
  });

  it('returns null for malformed / empty input instead of throwing', () => {
    expect(decryptSecret({ ciphertext: '', iv: '', tag: '' })).toBeNull();
    expect(
      decryptSecret({
        ciphertext: 'not-valid-base64!!!',
        iv: 'also-not-valid!!!',
        tag: 'nope!!!',
      }),
    ).toBeNull();
  });

  it('throws at encryption time when ENCRYPTION_KEY is the wrong length', () => {
    process.env.ENCRYPTION_KEY = Buffer.from('too-short').toString('base64');

    expect(() => encryptSecret('sk-should-not-be-produced')).toThrow();
  });
});
