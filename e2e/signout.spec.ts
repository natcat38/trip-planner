import 'dotenv/config';
import { test, expect } from '@playwright/test';
import { db } from '../src/lib/db';
import { signInAs } from './auth';

test('signed-in user can sign out and loses access', async ({
  context,
  page,
}) => {
  await signInAs(db, context, 'signout');
  await page.goto('/trips');
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL('/');
  await page.goto('/trips');
  // proxy.ts guards /trips — an unauthenticated visit is redirected to sign-in.
  await expect(page).toHaveURL(/\/api\/auth\/signin/);
});
