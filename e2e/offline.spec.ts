import 'dotenv/config';
import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';

// The offline layer is the one feature in this app whose entire behaviour only
// appears with the network switched off, so a mocked unit test can't reach it —
// src/lib/offline.test.ts covers which requests sw.js decides to cache, and
// this covers whether a cached page actually comes back.
//
// Driven through /shared/[token] rather than a signed-in /trips/[id]: this
// repo has no test OAuth account (see e2e/sharing.spec.ts), and the share
// route exercises the identical service worker path — a same-origin GET
// navigation, cached on the way through, served from cache when fetch fails.
test.describe('offline', () => {
  test('the manifest is served and describes an installable app', async ({
    page,
  }) => {
    const response = await page.goto('/manifest.webmanifest');
    expect(response?.ok()).toBe(true);

    const manifest = JSON.parse(await response!.text());
    expect(manifest.display).toBe('standalone');
    // Chrome refuses to install without both sizes.
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
  });

  test('a page already visited still renders with the network down', async ({
    page,
    context,
  }) => {
    const user = await db.user.create({
      data: { email: `offline-e2e-${crypto.randomUUID()}@example.com` },
    });
    try {
      const trip = await db.trip.create({
        data: {
          userId: user.id,
          name: 'Offline E2E Trip',
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
          // Geocoded on purpose: it puts a pin on the map, so the offline
          // assertion below covers the "map needs a connection" placeholder
          // rather than the empty-map message.
          placeName: 'Nanzoin',
          lat: 33.6183,
          lng: 130.5322,
          category: 'Sightseeing',
          sortOrder: 0,
        },
      });

      const url = `/shared/${trip.shareToken}`;
      await page.goto(url);
      await expect(
        page.getByRole('heading', { name: 'Offline E2E Trip' }),
      ).toBeVisible();

      // The worker claims existing clients on activate, but registration is
      // async — without waiting for it to control this page, the reload below
      // would race it and hit the network directly.
      await page.waitForFunction(
        () => navigator.serviceWorker?.controller != null,
        undefined,
        { timeout: 15_000 },
      );
      // First load happened before the worker was controlling, so its response
      // never passed through the fetch handler. This visit is the one that
      // populates the cache.
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Offline E2E Trip' }),
      ).toBeVisible();

      await context.setOffline(true);
      await page.reload();

      await expect(
        page.getByRole('heading', { name: 'Offline E2E Trip' }),
      ).toBeVisible();
      await expect(page.getByText('Nanzoin reclining Buddha')).toBeVisible();
      await expect(page.getByRole('status')).toContainText(/offline/i);
      // Map tiles are deliberately not cached (ADR-0015) — the map area has to
      // say so rather than render an empty grey square.
      await expect(page.getByText(/map needs a connection/i)).toBeVisible();
    } finally {
      await context.setOffline(false);
      await db.trip.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });

  test('a page never visited falls back to the offline page, not a browser error', async ({
    page,
    context,
  }) => {
    await page.goto('/');
    await page.waitForFunction(
      () => navigator.serviceWorker?.controller != null,
      undefined,
      { timeout: 15_000 },
    );

    await context.setOffline(true);
    try {
      await page.goto('/shared/never-visited-on-this-device');
      await expect(
        page.getByRole('heading', { name: /you.?re offline/i }),
      ).toBeVisible();
    } finally {
      await context.setOffline(false);
    }
  });
});
