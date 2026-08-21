import 'dotenv/config';
import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';
import { signInAs } from './auth';

// The offline layer is the one feature in this app whose entire behaviour only
// appears with the network switched off, so a mocked unit test can't reach it —
// src/lib/offline.test.ts covers which requests sw.js decides to cache, and
// this covers whether a cached page actually comes back.
//
// The caching tests drive /shared/[token] rather than a signed-in /trips/[id]:
// the share route exercises the identical service worker path — a same-origin
// GET navigation, cached on the way through, served from cache when fetch
// fails — with none of the session setup. The cache-clearing test below does
// need a session, and creates one the way the other specs here do.
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

  test('drops every cached page once the session ends', async ({
    page,
    context,
  }) => {
    // The security control from ADR-0015 §5: cached trip pages must not
    // outlive the session that fetched them, or the next person to use this
    // browser profile can read them offline.
    //
    // Worth an end-to-end test rather than trusting the unit test, because the
    // first implementation of this check could never fire: a navigation
    // Request has redirect mode "manual", so the auth redirect arrives as an
    // opaqueredirect with `redirected: false` and no destination URL.
    const user = await db.user.create({
      data: { email: `offline-session-${crypto.randomUUID()}@example.com` },
    });
    try {
      const trip = await db.trip.create({
        data: {
          userId: user.id,
          name: 'Session Ends Trip',
          destinations: ['Fukuoka'],
          startDate: new Date('2026-11-14'),
          endDate: new Date('2026-11-14'),
          baseCurrency: 'JPY',
          budgetMinor: 0,
        },
      });
      const sessionToken = crypto.randomUUID();
      await db.session.create({
        data: {
          sessionToken,
          userId: user.id,
          expires: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      await context.addCookies([
        {
          name: 'authjs.session-token',
          value: sessionToken,
          domain: 'localhost',
          path: '/',
          httpOnly: true,
          sameSite: 'Lax',
        },
      ]);

      await page.goto(`/trips/${trip.id}`);
      await page.waitForFunction(
        () => navigator.serviceWorker?.controller != null,
        undefined,
        { timeout: 15_000 },
      );
      await page.reload();
      await expect(
        page.getByRole('heading', { name: 'Session Ends Trip' }),
      ).toBeVisible();
      // The page is now cached — confirm before proving it goes away.
      expect(
        await page.evaluate(
          async (url) => (await caches.match(url)) != null,
          `/trips/${trip.id}`,
        ),
      ).toBe(true);

      // End the session the way an expiry or a sign-out would.
      await db.session.deleteMany({ where: { userId: user.id } });
      await page.goto(`/trips/${trip.id}`);
      await expect(page).toHaveURL(/\/api\/auth\/signin/);

      expect(
        await page.evaluate(
          async (url) => (await caches.match(url)) != null,
          `/trips/${trip.id}`,
        ),
      ).toBe(false);

      // ...and the offline fallback is put back, so going offline after a
      // sign-out still degrades to a real page rather than a browser error.
      expect(
        await page.evaluate(
          async () => (await caches.match('/offline')) != null,
        ),
      ).toBe(true);
    } finally {
      await db.trip.deleteMany({ where: { userId: user.id } });
      await db.session.deleteMany({ where: { userId: user.id } });
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

  test('the offline fallback still works after signing out through the button', async ({
    page,
    context,
  }) => {
    // The button's fix under test: it messages the worker to clear-and-restore
    // via clearAllCaches() directly, rather than relying on the redirect-based
    // fallback (which only fires on the *next* guarded navigation). If the
    // button instead deleted every cache without restoring /offline, this
    // profile would lose the offline fallback until sw.js's bytes next change.
    const { user } = await signInAs(db, context, 'offline-signout');
    try {
      await page.goto('/trips');
      await page.waitForFunction(
        () => navigator.serviceWorker?.controller != null,
        undefined,
        { timeout: 15_000 },
      );

      await expect(
        page.getByRole('button', { name: 'Sign out' }),
      ).toBeVisible();
      await page.getByRole('button', { name: 'Sign out' }).click();
      await page.waitForURL('/');

      expect(
        await page.evaluate(
          async () => (await caches.match('/offline')) != null,
        ),
      ).toBe(true);

      await context.setOffline(true);
      try {
        await page.goto('/shared/never-visited-after-signout');
        await expect(
          page.getByRole('heading', { name: /you.?re offline/i }),
        ).toBeVisible();
      } finally {
        await context.setOffline(false);
      }
    } finally {
      await db.session.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });
});
