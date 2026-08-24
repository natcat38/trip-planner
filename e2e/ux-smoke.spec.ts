import { test, expect } from '@playwright/test';

// Target-agnostic UX smoke suite: runs identically against local dev/build
// and prod (see playwright.config.ts's PLAYWRIGHT_BASE_URL handling and the
// "test:e2e:prod" package.json script). Every test here uses only public,
// unauthenticated surfaces — no db import, no signInAs (see e2e/auth.ts) —
// because prod has no seedable database connection and no test OAuth
// account. This is deliberately narrower than the rest of e2e/*, which do
// assume a local Postgres (see e2e/sharing.spec.ts, e2e/offline.spec.ts):
// it closes the "prod never functionally tested" gap only as far as
// credential-free coverage allows.
test.describe('ux-smoke', () => {
  test('the landing page is the real app, not framework boilerplate, and offers a theme toggle', async ({
    page,
  }) => {
    const response = await page.goto('/');
    expect(response?.ok()).toBe(true);

    // Same assertions as e2e/smoke.spec.ts's boilerplate check, reused here
    // so a prod deploy that regressed to the create-next-app default page
    // fails this suite too.
    await expect(
      page.getByRole('heading', { name: 'Trip Planner', level: 1 }),
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: /go to my trips/i }),
    ).toBeVisible();
    await expect(page.getByText(/edit the page\.tsx/i)).toHaveCount(0);
    await expect(page.getByRole('link', { name: /deploy now/i })).toHaveCount(
      0,
    );

    // ThemeToggle (src/app/ThemeToggle.tsx) renders on every unauthenticated
    // page's header row, including this one.
    await expect(page.getByLabel('Theme')).toBeVisible();
  });

  test('a protected route redirects a signed-out visitor to sign-in, which offers Google and GitHub', async ({
    page,
  }) => {
    const response = await page.goto('/trips');
    // proxy.ts guards /trips (see e2e/signout.spec.ts / sharing.spec.ts).
    await expect(page).toHaveURL(/\/api\/auth\/signin/);
    expect(response?.ok()).toBe(true);

    // src/auth.ts configures exactly these two providers.
    await expect(page.getByRole('button', { name: /google/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /github/i })).toBeVisible();
  });

  test('the offline fallback page renders on a direct visit', async ({
    page,
  }) => {
    // src/app/offline/page.tsx is a plain static page reachable directly
    // (not just via the service worker's catch handler) — no db access, no
    // auth gate, so it's safe to hit on any target.
    const response = await page.goto('/offline');
    expect(response?.ok()).toBe(true);
    await expect(
      page.getByRole('heading', { name: /you.?re offline/i }),
    ).toBeVisible();
  });

  test.describe('shared trip view', () => {
    const sharedPath = process.env.SHARED_TRIP_PATH;

    test.skip(
      !sharedPath,
      'Set SHARED_TRIP_PATH (e.g. "/shared/<token>") to a real share link ' +
        'on the target deployment to exercise this test; skipped because ' +
        'no share token was provided for this run.',
    );

    test('renders trip name, itinerary days, and the budget roll-up, with no edit/delete controls', async ({
      page,
    }) => {
      const response = await page.goto(sharedPath!);
      expect(response?.ok()).toBe(true);

      // Trip name: SharedTripView.tsx renders it as the page's <h1>.
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      // Itinerary days: each day is an <h2> from formatDay().
      await expect(
        page.getByRole('heading', { level: 2 }).first(),
      ).toBeVisible();
      // Budget roll-up section.
      await expect(
        page.getByRole('heading', { name: 'Budget', level: 2 }),
      ).toBeVisible();

      // Read-only guarantee (ADR-driven — see SharedTripView.tsx comments):
      // no Edit/Delete affordances anywhere on the page. "Save a copy" is a
      // duplication action, not an edit/delete of the shared trip itself,
      // so it's intentionally excluded from this check.
      await expect(page.getByRole('button', { name: /^edit$/i })).toHaveCount(
        0,
      );
      await expect(page.getByRole('button', { name: /^delete$/i })).toHaveCount(
        0,
      );
      await expect(page.getByRole('link', { name: /^edit$/i })).toHaveCount(0);
    });
  });
});
