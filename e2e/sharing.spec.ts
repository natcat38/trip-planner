import 'dotenv/config';
import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';
import { signInAs } from './auth';

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

  // TRIP-UX-1 / TRIP-UX-2: the shared view is two panes from lg (itinerary
  // plus sticky map) with a day-chip strip, and on a phone the map sits behind
  // a "Map" button instead of ahead of the first day.
  test('shared view: budget is a summary bar, day chips jump to a day, phone map is behind a toggle', async ({
    page,
  }) => {
    const user = await db.user.create({
      data: { email: `share-layout-e2e-${crypto.randomUUID()}@example.com` },
    });
    try {
      const trip = await db.trip.create({
        data: {
          userId: user.id,
          name: 'Share Layout E2E Trip',
          destinations: ['Fukuoka'],
          startDate: new Date('2026-11-14'),
          endDate: new Date('2026-11-15'),
          baseCurrency: 'JPY',
          budgetMinor: 450000,
          shareToken: crypto.randomBytes(24).toString('base64url'),
        },
      });
      for (const [i, date] of ['2026-11-14', '2026-11-15'].entries()) {
        const day = await db.day.create({
          data: { tripId: trip.id, date: new Date(date) },
        });
        await db.activity.create({
          data: {
            dayId: day.id,
            title: `Layout activity ${i + 1}`,
            lat: 33.6 + i / 100,
            lng: 130.5,
            category: 'Sightseeing',
            sortOrder: 0,
          },
        });
      }

      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/shared/${trip.shareToken}`);

      // Budget: the summary is visible, the breakdown is collapsed.
      await expect(
        page.getByRole('heading', { name: 'Budget', level: 2 }),
      ).toBeVisible();
      await expect(page.locator('details').first()).not.toHaveAttribute('open');

      // Day chips: the first is current; picking the second lands on its day.
      const chips = page.getByRole('navigation', { name: 'Jump to a day' });
      await expect(chips.getByRole('link').first()).toHaveAttribute(
        'aria-current',
        'location',
      );
      await chips.getByRole('link').nth(1).click();
      await expect(page).toHaveURL(/#day-/);
      await expect(chips.getByRole('link').nth(1)).toHaveAttribute(
        'aria-current',
        'location',
      );
      await expect(page.getByText('Layout activity 2')).toBeInViewport();

      // Phone: the map is closed until asked for; on desktop there is no
      // button and the pane is always there.
      const mapButton = page.getByRole('button', { name: 'Map', exact: true });
      await expect(mapButton).toHaveAttribute('aria-expanded', 'false');
      await mapButton.click();
      await expect(mapButton).toHaveAttribute('aria-expanded', 'true');
      await expect(page.locator('#shared-map-panel')).toBeVisible();
      await mapButton.click();
      await expect(page.locator('#shared-map-panel')).toHaveCount(0);

      await page.setViewportSize({ width: 1440, height: 900 });
      await expect(mapButton).toBeHidden();
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

  test('accepted collaborator sees the shared trip on /trips', async ({
    context,
    browser,
  }) => {
    const { user: owner } = await signInAs(db, context, 'share-owner');
    let collabUserId: string | undefined;
    try {
      const trip = await db.trip.create({
        data: {
          userId: owner.id,
          name: 'Kyoto',
          destinations: ['Kyoto'],
          startDate: new Date('2026-10-01'),
          endDate: new Date('2026-10-05'),
          baseCurrency: 'JPY',
          budgetMinor: 100000,
        },
      });

      const collabContext = await browser.newContext();
      try {
        const collabPage = await collabContext.newPage();
        const { user: collab } = await signInAs(
          db,
          collabContext,
          'share-collab',
        );
        collabUserId = collab.id;
        await db.tripCollaborator.create({
          data: { tripId: trip.id, email: collab.email, status: 'ACCEPTED' },
        });

        await collabPage.goto('/trips');
        await expect(
          collabPage.getByRole('heading', { name: 'Kyoto' }),
        ).toBeVisible();
      } finally {
        await collabContext.close();
      }
    } finally {
      await db.trip.deleteMany({ where: { userId: owner.id } });
      await db.session.deleteMany({ where: { userId: owner.id } });
      await db.user.delete({ where: { id: owner.id } });
      if (collabUserId) {
        await db.session.deleteMany({ where: { userId: collabUserId } });
        await db.user.delete({ where: { id: collabUserId } });
      }
    }
  });
});
