import 'dotenv/config';
import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';
import { signInAs } from './auth';

// B11: the responsive pass's real deliverable. Everything else in that task
// (padding, flex-wrap, stacked rows) is in service of this assertion — a
// page that fits at a real phone width without introducing horizontal
// scroll. document.documentElement.scrollWidth is the whole-document
// measurement (not just the viewport), so it catches an overflowing child
// even when nothing is visibly clipped on screen.
test.describe('mobile viewport (375px) has no horizontal scroll', () => {
  test.use({ viewport: { width: 375, height: 812 } });

  test('trips list fits without horizontal scroll', async ({
    page,
    context,
  }) => {
    await signInAs(db, context, 'responsive-e2e');

    await page.goto('/trips');
    await expect(
      page.getByRole('heading', { name: 'Your trips' }),
    ).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('trip detail page fits without horizontal scroll', async ({
    page,
    context,
  }) => {
    const { user } = await signInAs(db, context, 'responsive-e2e');
    const trip = await db.trip.create({
      data: {
        userId: user.id,
        // Deliberately long, unbroken destination/place names below —
        // exactly the shape that blows out a row without min-w-0/truncate,
        // per the OSM-sourced-name guard this task added.
        name: 'Responsive E2E Trip With An Unusually Long Name To Stress The Header Row',
        destinations: ['Kyoto'],
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-03'),
        baseCurrency: 'JPY',
        budgetMinor: 500000,
      },
    });
    const day = await db.day.create({
      data: { tripId: trip.id, date: new Date(Date.UTC(2026, 8, 1)) },
    });
    await db.activity.create({
      data: {
        dayId: day.id,
        title:
          'A Very Long Activity Title That Should Wrap Instead Of Overflowing The Row',
        category: 'Sightseeing',
        sortOrder: 0,
      },
    });

    await page.goto(`/trips/${trip.id}`);
    await expect(page.getByRole('heading', { name: trip.name })).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('trip places page fits without horizontal scroll', async ({
    page,
    context,
  }) => {
    const { user } = await signInAs(db, context, 'responsive-e2e');
    const trip = await db.trip.create({
      data: {
        userId: user.id,
        name: 'Responsive Places E2E Trip',
        destinations: ['Kyoto'],
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-03'),
        baseCurrency: 'JPY',
        budgetMinor: 500000,
      },
    });
    await db.place.create({
      data: {
        tripId: trip.id,
        source: 'osm',
        sourceId: 'responsive-e2e-osm-id',
        name: 'An Extremely Long OSM Place Name That Would Blow Out A Narrow Row Without A Truncate Guard',
        category: 'Food',
        lat: 35.0116,
        lng: 135.7681,
      },
    });

    await page.goto(`/trips/${trip.id}/places`);
    await expect(
      page.getByRole('heading', { name: `Places — ${trip.name}` }),
    ).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('settings page fits without horizontal scroll', async ({
    page,
    context,
  }) => {
    await signInAs(db, context, 'responsive-e2e');

    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });

  test('shared trip view fits without horizontal scroll', async ({ page }) => {
    const user = await db.user.create({
      data: {
        email: `responsive-shared-e2e-${crypto.randomUUID()}@example.com`,
      },
    });
    const trip = await db.trip.create({
      data: {
        userId: user.id,
        name: 'Responsive Shared E2E Trip With An Unusually Long Name',
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
        title:
          'A Very Long Activity Title That Should Wrap Instead Of Overflowing The Row',
        placeName: 'Nanzoin',
        lat: 33.6183,
        lng: 130.5322,
        category: 'Sightseeing',
        costMinor: 500,
        costCurrency: 'JPY',
        sortOrder: 0,
      },
    });

    await page.goto(`/shared/${trip.shareToken}`);
    await expect(page.getByRole('heading', { name: trip.name })).toBeVisible();

    const scrollWidth = await page.evaluate(
      () => document.documentElement.scrollWidth,
    );
    expect(scrollWidth).toBeLessThanOrEqual(375);
  });
});
