import 'dotenv/config';
import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';

// /settings holds users' encrypted provider API keys. It is auth-gated only
// because src/proxy.ts's matcher lists it — an unmatched route runs no proxy
// and is simply public, and that failure is completely silent: the page still
// renders, just for anyone. Hence a real browser test of the boundary rather
// than trusting the matcher by inspection.
test('the settings page redirects to sign-in when signed out', async ({
  page,
}) => {
  const response = await page.goto('/settings');
  await expect(page).toHaveURL(/\/api\/auth\/signin/);
  expect(response?.ok()).toBe(true);
});

test('the settings page renders no key form to a signed-out visitor', async ({
  page,
}) => {
  await page.goto('/settings');
  // Redirected to sign-in, so none of the key UI should have been served.
  await expect(page.getByRole('button', { name: /save/i })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
});

test.describe('settings, signed in', () => {
  let userId: string;
  let sessionToken: string;

  test.beforeEach(async ({ context }) => {
    const user = await db.user.create({
      data: { email: `settings-e2e-${crypto.randomUUID()}@example.com` },
    });
    userId = user.id;

    sessionToken = crypto.randomUUID();
    await db.session.create({
      data: {
        sessionToken,
        userId,
        expires: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await context.addCookies([
      {
        name: 'authjs.session-token',
        value: sessionToken,
        domain: 'localhost',
        path: '/',
      },
    ]);
  });

  test.afterEach(async () => {
    await db.session.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  test('offers a password-type key field that is never pre-filled', async ({
    page,
  }) => {
    await page.goto('/settings');
    await expect(page).not.toHaveURL(/\/api\/auth\/signin/);

    const field = page.locator('input[type="password"]').first();
    await expect(field).toBeVisible();
    // A stored key is never sent to the browser, so there is nothing to
    // pre-fill this with — assert that stays true.
    await expect(field).toHaveValue('');
  });

  test('rejects a key with an unrecognised prefix without storing it', async ({
    page,
  }) => {
    await page.goto('/settings');

    await page.locator('input[type="password"]').first().fill('not-a-real-key');
    await page.getByRole('button', { name: /save/i }).first().click();

    // The provider prefix check runs before any network call, so this is
    // deterministic and never touches Groq or OpenRouter.
    await expect(page.getByText(/groq|openrouter/i).first()).toBeVisible();

    const stored = await db.user.findUnique({ where: { id: userId } });
    expect(stored?.aiKeyCiphertext).toBeNull();
    expect(stored?.aiProvider).toBeNull();
  });
});
