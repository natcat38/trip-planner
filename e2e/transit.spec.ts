import 'dotenv/config';
import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';

// These tests exercise a real signed-in session end to end without any OAuth
// provider or credentials: Auth.js uses database sessions, so a valid
// session is created directly via Prisma and the cookie is set via
// Playwright's context.addCookies() (same technique as e2e/export.spec.ts,
// e2e/places.spec.ts).
//
// Coordinates are real (Tokyo Station and Tokyo Tower) and seeded directly
// via Prisma rather than driven through the map/geocoding UI — TransitLeg
// only needs two activities with lat/lng, and driving real geocoding would
// be flaky and unrelated to what this file covers.
test.describe('transit leg, signed in', () => {
  let userId: string;
  let tripId: string;
  let sessionToken: string;
  let dayId: string;

  test.beforeEach(async () => {
    const user = await db.user.create({
      data: { email: `transit-e2e-${crypto.randomUUID()}@example.com` },
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
        name: 'Transit E2E Trip',
        destinations: ['Tokyo'],
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-01'),
        baseCurrency: 'JPY',
        budgetMinor: 500000,
      },
    });
    tripId = trip.id;

    const day = await db.day.create({
      data: { tripId, date: trip.startDate },
    });
    dayId = day.id;
  });

  test.afterEach(async () => {
    await db.tripCollaborator.deleteMany({ where: { tripId } });
    await db.trip.deleteMany({ where: { id: tripId } });
    await db.session.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  test('renders a transit leg with correct Google/Apple Maps links between two geocoded activities, and never calls Transitous on page load', async ({
    page,
    context,
  }) => {
    await db.activity.create({
      data: {
        dayId,
        title: 'Tokyo Station',
        lat: 35.6812,
        lng: 139.7671,
        category: 'Sightseeing',
        sortOrder: 0,
      },
    });
    await db.activity.create({
      data: {
        dayId,
        title: 'Tokyo Tower',
        lat: 35.6586,
        lng: 139.7454,
        category: 'Sightseeing',
        sortOrder: 1,
      },
    });

    await context.addCookies([
      {
        name: 'authjs.session-token',
        value: sessionToken,
        url: 'http://localhost:3000',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    // The most valuable assertion in this file (ADR-0010): TransitLeg must
    // never call Transitous on render, only on explicit "Find transit"
    // clicks. planJourney's actual fetch runs server-side inside the
    // planTransitAction Server Action (src/lib/research/transitous.ts), so
    // it never crosses the browser's network stack at all — this
    // interception can only ever catch a *client-side* regression (e.g.
    // someone fetching Transitous directly from a 'use client' component).
    // It's still worth asserting: it's a real, if narrower, guard on the
    // "never fetch on render" rule, at zero cost to run.
    let transitousRequests = 0;
    await page.route('**api.transitous.org/**', (route) => {
      transitousRequests += 1;
      route.continue();
    });

    const response = await page.goto(`/trips/${tripId}`);
    expect(response?.ok()).toBe(true);

    const transitLeg = page.getByText('Getting there');
    await expect(transitLeg).toBeVisible();

    const googleLink = page.getByRole('link', { name: 'Google Maps' });
    const appleLink = page.getByRole('link', { name: 'Apple Maps' });
    await expect(googleLink).toBeVisible();
    await expect(appleLink).toBeVisible();

    // Assert on the decoded query params (not a substring match on the raw
    // href) so a swapped lat/lng or a dropped negative sign fails loudly,
    // matching googleMapsTransitUrl/appleMapsTransitUrl in
    // src/lib/research/mapLinks.ts exactly.
    const googleHref = await googleLink.getAttribute('href');
    expect(googleHref).not.toBeNull();
    const googleUrl = new URL(googleHref!);
    expect(googleUrl.hostname).toBe('www.google.com');
    expect(googleUrl.pathname).toBe('/maps/dir/');
    expect(googleUrl.searchParams.get('origin')).toBe('35.6812,139.7671');
    expect(googleUrl.searchParams.get('destination')).toBe(
      '35.6586,139.7454 (Tokyo Tower)',
    );
    expect(googleUrl.searchParams.get('travelmode')).toBe('transit');

    const appleHref = await appleLink.getAttribute('href');
    expect(appleHref).not.toBeNull();
    const appleUrl = new URL(appleHref!);
    expect(appleUrl.hostname).toBe('maps.apple.com');
    expect(appleUrl.searchParams.get('saddr')).toBe('35.6812,139.7671');
    expect(appleUrl.searchParams.get('daddr')).toBe(
      '35.6586,139.7454 (Tokyo Tower)',
    );
    expect(appleUrl.searchParams.get('dirflg')).toBe('r');

    await expect(
      page.getByRole('button', { name: 'Find transit' }),
    ).toBeVisible();

    expect(transitousRequests).toBe(0);
  });

  test('a trip whose activities lack coordinates renders no transit leg row', async ({
    page,
    context,
  }) => {
    await db.activity.create({
      data: {
        dayId,
        title: 'Breakfast at the hotel',
        category: 'Food',
        sortOrder: 0,
      },
    });
    await db.activity.create({
      data: {
        dayId,
        title: 'Dinner reservation',
        category: 'Food',
        sortOrder: 1,
      },
    });

    await context.addCookies([
      {
        name: 'authjs.session-token',
        value: sessionToken,
        url: 'http://localhost:3000',
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);

    const response = await page.goto(`/trips/${tripId}`);
    expect(response?.ok()).toBe(true);

    await expect(page.getByText('Breakfast at the hotel')).toBeVisible();
    await expect(page.getByText('Dinner reservation')).toBeVisible();

    await expect(page.getByText('Getting there')).not.toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Find transit' }),
    ).not.toBeVisible();
  });
});
