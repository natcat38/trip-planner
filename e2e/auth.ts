/**
 * Canonical e2e sign-in: create a real User + Session row and hand the
 * browser the authjs session cookie. Extracted from six specs that each
 * hand-rolled this with three different cookie shapes (2026-08-20).
 * @packageDocumentation
 */
import { randomUUID } from 'node:crypto';
import type { BrowserContext } from '@playwright/test';

export async function signInAs(
  // Prisma client type comes from each spec's existing import; keep this
  // structural so the helper doesn't import the generated client itself.
  db: {
    user: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural type; args shape comes from the caller's own Prisma client, which this helper deliberately doesn't import.
      create: (args: any) => Promise<{ id: string; email: string }>;
    };
    session: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- structural type; args shape comes from the caller's own Prisma client, which this helper deliberately doesn't import.
      create: (args: any) => Promise<{ sessionToken: string }>;
    };
  },
  context: BrowserContext,
  emailPrefix = 'e2e',
) {
  const user = await db.user.create({
    data: { email: `${emailPrefix}-${randomUUID()}@example.com` },
  });
  const session = await db.session.create({
    data: {
      sessionToken: randomUUID(),
      userId: user.id,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  await context.addCookies([
    {
      name: 'authjs.session-token',
      value: session.sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax' as const,
    },
  ]);
  return { user, sessionToken: session.sessionToken };
}
