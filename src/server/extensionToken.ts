/**
 * Browser-extension access tokens (Phase 3 M7, ADR-0017): the credential the
 * MV3 extension in `extension/` presents to `/api/extension/*`.
 *
 * Deliberately NOT a `'use server'` module, for the same reason as
 * src/server/aiSettings.ts: that directive publishes every export as a public
 * HTTP endpoint, and `identifyByExtensionToken` maps a bearer token to a user
 * id — the one function in this app that turns an arbitrary caller-supplied
 * string into an identity. It is called by route handlers, which import it
 * directly; the Server Actions live in src/app/settings/actions.ts.
 *
 * Why a token rather than the session cookie: the extension's origin is
 * `chrome-extension://`, which browsers treat as cross-site, and the Auth.js
 * session cookie is SameSite=Lax. Beyond that portability question, a cookie
 * carries ambient authority — every page in the browser could trigger a
 * request to a cookie-authenticated endpoint, so it would need CSRF defence.
 * A bearer token is never attached automatically, which removes that class of
 * bug rather than defending against it. See ADR-0017.
 * @packageDocumentation
 */

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { db } from '../lib/db';
import { currentUserId } from './auth-scope';

// Recognisable at a glance in a settings field or a bug report, and the kind
// of prefix secret scanners key on. Not a security property.
const TOKEN_PREFIX = 'tp_';
const TOKEN_BYTES = 32;

// SHA-256, not bcrypt/argon2. Those exist to make guessing LOW-entropy
// secrets slow; this token is 32 bytes from a CSPRNG, so there is nothing to
// guess and a slow hash would only make every API request slower.
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export interface ExtensionTokenStatus {
  present: boolean;
  createdAt: Date | null;
}

export async function getExtensionTokenStatus(): Promise<ExtensionTokenStatus> {
  const userId = await currentUserId();
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { extensionTokenHash: true, extensionTokenCreatedAt: true },
  });
  return {
    present: user?.extensionTokenHash != null,
    createdAt: user?.extensionTokenCreatedAt ?? null,
  };
}

// Returns the plaintext token, which is the ONLY time it exists outside the
// user's clipboard — only its hash is stored, so it cannot be shown again.
// Generating a second token replaces the first, which is also how a user
// rotates one: there is deliberately no list of active tokens, because one
// browser needs one token and a list is a feature nobody asked for.
export async function createExtensionToken(): Promise<string> {
  const userId = await currentUserId();
  const token = TOKEN_PREFIX + randomBytes(TOKEN_BYTES).toString('base64url');
  await db.user.update({
    where: { id: userId },
    data: {
      extensionTokenHash: hashToken(token),
      extensionTokenCreatedAt: new Date(),
    },
  });
  return token;
}

export async function revokeExtensionToken(): Promise<void> {
  const userId = await currentUserId();
  await db.user.update({
    where: { id: userId },
    data: { extensionTokenHash: null, extensionTokenCreatedAt: null },
  });
}

export interface ExtensionIdentity {
  userId: string;
  // Needed because trip access is "owner OR accepted collaborator", and
  // collaborators are matched by verified email (ADR-0006).
  email: string | undefined;
}

// The identity boundary for /api/extension/*. Those routes are NOT covered by
// src/proxy.ts (its matcher is /trips and /settings, not /api), so this
// function is the only thing standing between an anonymous HTTP request and a
// user's trips.
//
// Returns null for anything that doesn't resolve — malformed header, unknown
// token, revoked token — with no distinction between those cases, so a caller
// can't probe for which tokens once existed.
export async function identifyByExtensionToken(
  authorizationHeader: string | null,
): Promise<ExtensionIdentity | null> {
  if (!authorizationHeader) return null;
  const match = authorizationHeader.match(/^Bearer (.+)$/);
  if (!match) return null;
  const token = match[1].trim();
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const user = await db.user.findUnique({
    where: { extensionTokenHash: hashToken(token) },
    select: { id: true, email: true, extensionTokenHash: true },
  });
  if (!user?.extensionTokenHash) return null;

  // The unique-index lookup above already means only an exact hash match got
  // here, so this comparison cannot fail — it is a deliberate belt-and-braces
  // check that the value compared is the stored one, done in constant time so
  // that no future refactor to a non-unique lookup (or a LIKE query) can
  // quietly reintroduce a timing side channel.
  const presented = Buffer.from(hashToken(token), 'hex');
  const stored = Buffer.from(user.extensionTokenHash, 'hex');
  if (presented.length !== stored.length) return null;
  if (!timingSafeEqual(presented, stored)) return null;

  return { userId: user.id, email: user.email?.toLowerCase() ?? undefined };
}
