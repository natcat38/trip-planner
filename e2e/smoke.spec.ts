import { test, expect } from '@playwright/test';

test('home page responds', async ({ page }) => {
  const response = await page.goto('/');
  expect(response?.ok()).toBe(true);
});

// This page shipped as the create-next-app boilerplate through three phases
// and a whole-repo review, because the test above is satisfied by any page
// that returns 200 — boilerplate included. These assert what the page is,
// not merely that something answered.
test('home page is the app landing page, not framework boilerplate', async ({
  page,
}) => {
  await page.goto('/');

  await expect(
    page.getByRole('heading', { name: 'Trip Planner', level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByRole('link', { name: /go to my trips/i }),
  ).toBeVisible();

  await expect(page.getByText(/edit the page\.tsx/i)).toHaveCount(0);
  await expect(page.getByRole('link', { name: /deploy now/i })).toHaveCount(0);
});

test('the landing page links into the app', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: /go to my trips/i }).click();

  // /trips is auth-gated, so a signed-out visitor lands on sign-in — the point
  // is that the link goes into the app rather than nowhere.
  await expect(page).toHaveURL(/\/api\/auth\/signin|\/trips/);
});
