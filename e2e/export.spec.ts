import 'dotenv/config';
import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';

// Matches this repo's existing e2e pattern (see e2e/smoke.spec.ts,
// e2e/sharing.spec.ts) of verifying the redirect/render boundary rather
// than a full OAuth click-through (no test OAuth account exists in CI).
test('the print page redirects to sign-in when signed out', async ({ page }) => {
  const response = await page.goto('/trips/nonexistent-id/print');
  await expect(page).toHaveURL(/\/api\/auth\/signin/);
  expect(response?.ok()).toBe(true);
});

// These tests exercise a real signed-in session end to end without any
// OAuth provider or credentials: Auth.js uses database sessions, so a
// valid session is created directly via Prisma (same technique as this
// repo's .db.test.ts suites) and the cookie is set via Playwright's
// context.addCookies(), which works at the browser-context level and
// isn't blocked by the cookie's httpOnly flag (that only restricts
// page-JS access via document.cookie, not Playwright's own API).
test.describe('print page, signed in', () => {
  let userId: string;
  let tripId: string;
  let sessionToken: string;

  test.beforeEach(async () => {
    const user = await db.user.create({
      data: { email: `print-e2e-${crypto.randomUUID()}@example.com` },
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

    const trip = await db.trip.create({
      data: {
        userId,
        name: 'Print E2E Trip',
        destinations: ['Kyoto'],
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-02'),
        baseCurrency: 'JPY',
        budgetMinor: 500000,
      },
    });
    tripId = trip.id;

    const day = await db.day.create({
      data: { tripId, date: trip.startDate },
    });
    await db.activity.create({
      data: {
        dayId: day.id,
        title: 'Fushimi Inari',
        category: 'Sightseeing',
        sortOrder: 0,
      },
    });
  });

  test.afterEach(async () => {
    await db.tripCollaborator.deleteMany({ where: { tripId } });
    await db.trip.deleteMany({ where: { id: tripId } });
    await db.session.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  test('renders the itinerary and budget, hides nav on print', async ({
    page,
    context,
  }) => {
    await context.addCookies([
      {
        name: 'authjs.session-token',
        value: sessionToken,
        url: 'http://localhost:3000',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const response = await page.goto(`/trips/${tripId}/print`);
    expect(response?.ok()).toBe(true);

    await expect(
      page.getByRole('heading', { name: 'Print E2E Trip' }),
    ).toBeVisible();
    await expect(page.getByText('Fushimi Inari')).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Back to trip' }),
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Export PDF' }),
    ).toBeVisible();

    await page.emulateMedia({ media: 'print' });
    await expect(page.getByRole('link', { name: 'Back to trip' })).toBeHidden();
    await expect(
      page.getByRole('button', { name: 'Export PDF' }),
    ).toBeHidden();
    await expect(page.getByText('Fushimi Inari')).toBeVisible();
  });

  test("a different signed-in user can't access the trip", async ({
    page,
    context,
  }) => {
    const otherUser = await db.user.create({
      data: { email: `print-e2e-other-${crypto.randomUUID()}@example.com` },
    });
    const otherToken = crypto.randomUUID();
    await db.session.create({
      data: {
        sessionToken: otherToken,
        userId: otherUser.id,
        expires: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await context.addCookies([
      {
        name: 'authjs.session-token',
        value: otherToken,
        url: 'http://localhost:3000',
      },
    ]);

    try {
      const response = await page.goto(`/trips/${tripId}/print`);
      expect(response?.ok()).toBe(true);
      await expect(
        page.getByText("doesn't exist or you don't have access"),
      ).toBeVisible();
    } finally {
      await db.session.deleteMany({ where: { userId: otherUser.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    }
  });
});
