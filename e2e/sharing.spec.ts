import 'dotenv/config';
import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';

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

  // The map is a Client Component, so anything the server page hands it has to
  // be serialisable. Passing a no-op onSelectPin made every valid share link
  // 500 while the invalid-token test above still passed, so this one renders a
  // real trip with a mapped activity.
  test('a valid share token renders the trip, budget and activities', async ({
    page,
  }) => {
    const user = await db.user.create({
      data: { email: `share-e2e-${crypto.randomUUID()}@example.com` },
    });
    try {
      const trip = await db.trip.create({
        data: {
          userId: user.id,
          name: 'Share E2E Trip',
          destinations: ['Fukuoka'],
          startDate: new Date('2026-11-14'),
          endDate: new Date('2026-11-14'),
          baseCurrency: 'JPY',
          budgetMinor: 450000,
          shareToken: crypto.randomBytes(24).toString('base64url'),
        },
      });
      const day = await db.day.create({
        data: { tripId: trip.id, date: trip.startDate },
      });
      await db.activity.create({
        data: {
          dayId: day.id,
          title: 'Nanzoin reclining Buddha',
          placeName: 'Nanzoin',
          lat: 33.6183,
          lng: 130.5322,
          category: 'Sightseeing',
          costMinor: 500,
          costCurrency: 'JPY',
          sortOrder: 0,
        },
      });

      const response = await page.goto(`/shared/${trip.shareToken}`);
      expect(response?.ok()).toBe(true);
      await expect(
        page.getByRole('heading', { name: 'Share E2E Trip' }),
      ).toBeVisible();
      await expect(page.getByText('Nanzoin reclining Buddha')).toBeVisible();
      await expect(page.getByText('¥450,000')).toBeVisible();
    } finally {
      await db.trip.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });

  test('the trips dashboard redirects to sign-in when signed out', async ({
    page,
  }) => {
    const response = await page.goto('/trips');
    await expect(page).toHaveURL(/\/api\/auth\/signin/);
    expect(response?.ok()).toBe(true);
  });
});
