/**
 * AES-256-GCM encryption for user-supplied secrets (BYOK provider API keys)
 * at rest in Postgres. Node's built-in `crypto` only — no new dependencies.
 * @packageDocumentation
 */
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { requireEnv } from './env';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH_BYTES = 32; // AES-256
const IV_LENGTH_BYTES = 12; // GCM's recommended nonce size
const TAG_LENGTH_BYTES = 16; // GCM auth tag size for this algorithm

export interface EncryptedSecret {
  ciphertext: string;
  iv: string;
  tag: string;
}

// ENCRYPTION_KEY is base64-encoded and must decode to exactly 32 bytes
// (AES-256). Generate one with:
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// Validated on every use rather than once at startup, so a bad value fails
// loudly at the call site instead of silently truncating/padding into a key
// that "works" but can never decrypt what it encrypted.
function loadKey(): Buffer {
  const raw = requireEnv('ENCRYPTION_KEY');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `ENCRYPTION_KEY must be base64 for ${KEY_LENGTH_BYTES} bytes (AES-256); decoded to ${key.length} bytes`,
    );
  }
  return key;
}

// Throws on genuine misconfiguration (missing or wrong-length ENCRYPTION_KEY)
// — that's a deploy-time error, not something a user should ever see.
export function encryptSecret(plaintext: string): EncryptedSecret {
  const key = loadKey();
  // A fresh random IV on every call. Never reuse, never derive it from the
  // key or plaintext: reusing a GCM IV with the same key lets an attacker
  // recover plaintext (XOR two ciphertexts) and forge auth tags. Do not
  // "optimise" this into a counter or a fixed value.
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  };
}

// Never throws. Wrong ENCRYPTION_KEY (e.g. after rotation), a tampered
// ciphertext, a bad auth tag, or malformed input are all indistinguishable
// from "no usable key stored" to the caller: return null and let the caller
// ask the user to re-enter their key. An unreadable stored secret must never
// crash a page.
export function decryptSecret(parts: EncryptedSecret): string | null {
  try {
    const key = loadKey();
    const iv = Buffer.from(parts.iv, 'base64');
    const tag = Buffer.from(parts.tag, 'base64');
    const ciphertext = Buffer.from(parts.ciphertext, 'base64');
    if (iv.length !== IV_LENGTH_BYTES || tag.length !== TAG_LENGTH_BYTES)
      return null;

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  } catch {
    return null;
  }
}
