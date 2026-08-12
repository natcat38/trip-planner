import { expect, test } from '@playwright/test';

// These hit real routes without a signed-in session, matching this repo's
// existing e2e pattern (see e2e/smoke.spec.ts) of verifying redirect/render
// behavior rather than a full OAuth click-through (no test OAuth account
// exists in CI).
test.describe('sharing', () => {
  test('an invalid share token shows the "not valid" message, not a 500', async ({
    page,
  }) => {
    const response = await page.goto('/shared/this-token-does-not-exist');
    expect(response?.ok()).toBe(true);
    await expect(page.getByText('This link is no longer valid.')).toBeVisible();
  });

  test('the trips dashboard redirects to sign-in when signed out', async ({
    page,
  }) => {
    const response = await page.goto('/trips');
    await expect(page).toHaveURL(/\/api\/auth\/signin/);
    expect(response?.ok()).toBe(true);
  });
});
