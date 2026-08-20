// Deliberately NOT a `'use server'` module, unlike its siblings here.
// `'use server'` turns every export into a Server Action, and Next's own
// guidance is to treat Server Actions as public HTTP endpoints — which would
// publish `getDecryptedKey` (below) as an endpoint returning the user's
// plaintext API key to anyone signed in, and hand any XSS on any page a
// one-call exfiltration route. The route's own `src/app/settings/actions.ts`
// carries `'use server'` and exposes only the safe operations; this module is
// imported server-side by that file, by the settings page, and by
// guideSummary.ts. Do not add the directive here.

/**
 * BYOK AI key settings (Phase 3 M3, ADR-0011): store, mask, and retrieve the
 * user's own Groq/OpenRouter API key. Mirrors src/server/places.ts's shape
 * and authorization pattern, but the resource here is the user's own row —
 * there's no tripId, so every export gates on `currentUserId()` directly
 * rather than `requireTripAccess`.
 *
 * Storage lives inline on `User` (see prisma/schema.prisma's comment for why
 * there's no separate UserApiKey table). The plaintext key is encrypted at
 * rest via src/lib/crypto.ts (AES-256-GCM) and must never reach the browser:
 * every export that's safe for a Server Component/Action to return exposes
 * only a mask, never the real key. `getDecryptedKey` is the one exception —
 * see its doc comment.
 * @packageDocumentation
 */

import { decryptSecret, encryptSecret } from '../lib/crypto';
import {
  type AiProvider,
  detectProvider,
  listModels,
  testKey,
} from '../lib/ai/provider';
import { db } from '../lib/db';
import { currentUserId } from './auth-scope';
import { ValidationError } from './errors';

// First few and last four characters, e.g. "gsk_ab…4f2a" — enough for a user
// to recognise which key is stored without ever reconstructing the real one.
// Keys shorter than this are masked down to a bare ellipsis rather than risk
// the prefix/suffix windows overlapping and exposing the whole thing.
const MASK_PREFIX_LEN = 6;
const MASK_SUFFIX_LEN = 4;
function maskKey(key: string): string {
  if (key.length <= MASK_PREFIX_LEN + MASK_SUFFIX_LEN) return '…';
  return `${key.slice(0, MASK_PREFIX_LEN)}…${key.slice(-MASK_SUFFIX_LEN)}`;
}

// Shared read+decrypt for getKeyStatus/getDecryptedKey. Returns null for
// every "unusable" case alike (no key ever saved, or one that no longer
// decrypts under the current ENCRYPTION_KEY) — callers don't need to tell
// those apart, both mean "prompt the user to (re-)enter a key".
async function loadDecryptedKey(userId: string): Promise<{
  plaintext: string;
  provider: AiProvider;
  model: string | null;
  updatedAt: Date;
} | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      aiProvider: true,
      aiKeyCiphertext: true,
      aiKeyIv: true,
      aiKeyTag: true,
      aiModel: true,
      aiKeyUpdatedAt: true,
    },
  });
  // aiKeyUpdatedAt is guarded alongside the ciphertext fields rather than
  // assumed present: a row carrying ciphertext but no timestamp (a partial
  // restore, or a migration that adds these columns separately) would
  // otherwise reach the client typed as a Date but holding null, and
  // AiKeyPanel's toLocaleDateString() would break the one page the user
  // could fix their key from.
  if (
    !user?.aiProvider ||
    !user.aiKeyCiphertext ||
    !user.aiKeyIv ||
    !user.aiKeyTag ||
    !user.aiKeyUpdatedAt
  ) {
    return null;
  }
  const plaintext = decryptSecret({
    ciphertext: user.aiKeyCiphertext,
    iv: user.aiKeyIv,
    tag: user.aiKeyTag,
  });
  if (plaintext === null) return null; // rotated/tampered — never throw, treat as "no key"

  return {
    plaintext,
    provider: user.aiProvider as AiProvider,
    model: user.aiModel,
    updatedAt: user.aiKeyUpdatedAt,
  };
}

export interface KeyStatus {
  provider: AiProvider;
  maskedKey: string;
  model: string | null;
  updatedAt: Date;
}

export async function getKeyStatus(): Promise<KeyStatus | null> {
  const userId = await currentUserId();
  const row = await loadDecryptedKey(userId);
  if (!row) return null;
  return {
    provider: row.provider,
    maskedKey: maskKey(row.plaintext),
    model: row.model,
    updatedAt: row.updatedAt,
  };
}

export async function saveApiKey(rawKey: string): Promise<void> {
  const userId = await currentUserId();

  const provider = detectProvider(rawKey);
  if (!provider) {
    throw new ValidationError(
      'That doesn\'t look like a Groq or OpenRouter key. Groq keys start with "gsk_", OpenRouter keys start with "sk-or-v1-".',
    );
  }

  // Verify before storing: testKey hits a dedicated zero-cost, idempotent
  // endpoint (src/lib/ai/provider.ts), so this costs nothing from the user's
  // own metered quota and catches a dead/typo'd/revoked key immediately
  // instead of persisting junk that only fails on the trip's first AI
  // request. A rejected key is never written.
  const result = await testKey(rawKey);
  if (!result.ok) {
    // "Couldn't verify", not "was rejected": testKey returns the same shape
    // for a provider that's down as for a bad key, and telling someone their
    // valid key was rejected during an outage invites them to revoke and
    // regenerate it for nothing.
    throw new ValidationError(`Couldn't verify that key: ${result.reason}`);
  }

  const encrypted = encryptSecret(rawKey);
  await db.user.update({
    where: { id: userId },
    data: {
      aiProvider: provider,
      aiKeyCiphertext: encrypted.ciphertext,
      aiKeyIv: encrypted.iv,
      aiKeyTag: encrypted.tag,
      // A new key may be on a different provider/account than the last one,
      // so any previously chosen model id is no longer meaningful — clear it
      // rather than carry forward a model that might not exist here.
      aiModel: null,
      aiKeyUpdatedAt: new Date(),
    },
  });
}

export async function setModel(model: string): Promise<void> {
  const userId = await currentUserId();
  if (!model.trim()) throw new ValidationError('Choose a model.');

  // Not re-checked against listAvailableModels here: that would mean
  // decrypting the stored key and making a live provider request on every
  // model change, purely to guard against a UI bug (the picker is already
  // populated from listAvailableModels). If a stale/bad id ever does get
  // stored, complete() in src/lib/ai/provider.ts fails gracefully (returns
  // null, never throws) exactly like any other provider error — so the
  // failure mode is "no reply", not a crash. Mirrors this module's own
  // "be lazy, no repository layer" mandate.
  await db.user.update({
    where: { id: userId },
    data: { aiModel: model },
  });
}

export async function deleteApiKey(): Promise<void> {
  const userId = await currentUserId();
  await db.user.update({
    where: { id: userId },
    data: {
      aiProvider: null,
      aiKeyCiphertext: null,
      aiKeyIv: null,
      aiKeyTag: null,
      aiModel: null,
      aiKeyUpdatedAt: null,
    },
  });
}

export async function listAvailableModels(): Promise<
  { id: string; free: boolean }[] | null
> {
  const key = await getDecryptedKey();
  if (!key) return null;
  return listModels(key.key);
}

/**
 * Returns the user's decrypted API key, provider, and chosen model.
 *
 * SERVER-INTERNAL ONLY. This must never be reached from a Server Component's
 * returned props or a Server Action's return value — either would round-trip
 * the plaintext key to the browser. Callers should use the result only to
 * immediately pass the key into src/lib/ai/provider.ts (listModels/complete)
 * server-side, never store it, log it, or forward it further.
 */
export async function getDecryptedKey(): Promise<{
  key: string;
  provider: AiProvider;
  model: string | null;
} | null> {
  const userId = await currentUserId();
  const row = await loadDecryptedKey(userId);
  if (!row) return null;
  return { key: row.plaintext, provider: row.provider, model: row.model };
}
