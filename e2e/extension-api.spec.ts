import 'dotenv/config';
import crypto from 'node:crypto';
import { expect, test, type BrowserContext } from '@playwright/test';
import { db } from '../src/lib/db';

// /api/extension/* is NOT covered by src/proxy.ts's matcher, so these routes
// are reachable without a session and authenticate themselves. That makes them
// the only place in this app where an arbitrary caller-supplied string becomes
// an identity — worth testing over real HTTP rather than only underneath.
//
// The token is generated through the Settings UI rather than written straight
// into the database, so this covers the whole path a user actually takes.
const SESSION_COOKIE = 'authjs.session-token';

async function signIn(context: BrowserContext, userId: string) {
  const sessionToken = crypto.randomUUID();
  await db.session.create({
    data: {
      sessionToken,
      userId,
      expires: new Date(Date.now() + 60 * 60 * 1000),
    },
  });
  await context.addCookies([
    {
      name: SESSION_COOKIE,
      value: sessionToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      sameSite: 'Lax',
    },
  ]);
}

test.describe('extension API', () => {
  let userId: string;
  let tripId: string;

  test.beforeEach(async () => {
    const user = await db.user.create({
      data: { email: `ext-api-${crypto.randomUUID()}@example.com` },
    });
    userId = user.id;
    const trip = await db.trip.create({
      data: {
        userId,
        name: 'Extension E2E Trip',
        destinations: ['Fukuoka'],
        startDate: new Date('2026-11-14'),
        endDate: new Date('2026-11-14'),
        baseCurrency: 'JPY',
        budgetMinor: 0,
      },
    });
    tripId = trip.id;
  });

  test.afterEach(async () => {
    await db.trip.deleteMany({ where: { userId } });
    await db.session.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
  });

  async function generateToken(
    page: import('@playwright/test').Page,
    context: BrowserContext,
  ): Promise<string> {
    await signIn(context, userId);
    await page.goto('/settings');
    await page.getByRole('button', { name: /generate token/i }).click();

    const field = page.locator('input[readonly]');
    await expect(field).toBeVisible();
    const token = await field.inputValue();
    expect(token).toMatch(/^tp_/);
    return token;
  }

  // Saving needs a real geocode, and geocode() returns null without
  // MAPBOX_TOKEN — which CI deliberately does not have, because this repo
  // keeps live third-party calls out of CI (see transit.spec.ts asserting
  // Transitous is never called). So the save-success path runs locally, where
  // .env has a token, and the honest-degradation path runs in CI. Both are
  // correct behaviour; each test asserts the one that applies.
  const hasGeocoder = Boolean(process.env.MAPBOX_TOKEN);

  test('a generated token lists the user trips and saves a place', async ({
    page,
    context,
    request,
  }) => {
    test.skip(!hasGeocoder, 'needs MAPBOX_TOKEN to geocode the saved place');
    const token = await generateToken(page, context);

    const list = await request.get('/api/extension/trips', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(list.ok()).toBe(true);
    const { trips } = await list.json();
    expect(trips).toContainEqual(
      expect.objectContaining({ id: tripId, name: 'Extension E2E Trip' }),
    );
    // A trip list for an extension has no business carrying the public share
    // token — that would turn a save-a-place credential into a way to publish.
    expect(JSON.stringify(trips)).not.toContain('shareToken');

    const saved = await request.post('/api/extension/places', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        tripId,
        name: 'Fukuoka Tower',
        url: 'https://example.com/fukuoka-guide',
        category: 'Sightseeing',
        notes: 'Recommended by the blog',
      },
    });
    expect(saved.ok()).toBe(true);

    const place = await db.place.findFirstOrThrow({ where: { tripId } });
    expect(place.name).toBe('Fukuoka Tower');
    expect(place.source).toBe('extension');
    expect(place.website).toBe('https://example.com/fukuoka-guide');
    // Geocoded server-side — the extension never sends coordinates.
    expect(place.lat).not.toBeNull();
  });

  test('saving the same page twice updates rather than duplicating', async ({
    page,
    context,
    request,
  }) => {
    test.skip(!hasGeocoder, 'needs MAPBOX_TOKEN to geocode the saved place');
    const token = await generateToken(page, context);
    const body = {
      tripId,
      name: 'Fukuoka Tower',
      url: 'https://example.com/same-page',
    };

    await request.post('/api/extension/places', {
      headers: { Authorization: `Bearer ${token}` },
      data: body,
    });
    await request.post('/api/extension/places', {
      headers: { Authorization: `Bearer ${token}` },
      data: { ...body, name: 'Fukuoka Tower (renamed)' },
    });

    const places = await db.place.findMany({ where: { tripId } });
    expect(places).toHaveLength(1);
    expect(places[0].name).toBe('Fukuoka Tower (renamed)');
  });

  test('reports a place it cannot locate instead of failing opaquely', async ({
    page,
    context,
    request,
  }) => {
    test.skip(
      hasGeocoder,
      'the geocoder is configured, so this cannot be provoked',
    );
    // The complement of the two tests above, and what actually runs in CI.
    // Without a Mapbox token geocode() returns null rather than throwing, and
    // Place.lat/lng are non-null — so the only correct answer is to say so.
    // A 500 here would mean that null was reaching the database layer.
    const token = await generateToken(page, context);

    const response = await request.post('/api/extension/places', {
      headers: { Authorization: `Bearer ${token}` },
      data: {
        tripId,
        name: 'Fukuoka Tower',
        url: 'https://example.com/fukuoka-guide',
      },
    });

    expect(response.status()).toBe(422);
    expect(await response.text()).toMatch(/couldn.t find/i);
    expect(await db.place.count({ where: { tripId } })).toBe(0);
  });

  test('refuses every request without a valid token', async ({ request }) => {
    const cases: Record<string, string>[] = [
      {},
      { Authorization: 'Bearer tp_wrong' },
      { Authorization: 'Basic tp_wrong' },
    ];
    for (const headers of cases) {
      const list = await request.get('/api/extension/trips', { headers });
      expect(list.status()).toBe(401);

      const save = await request.post('/api/extension/places', {
        headers,
        data: { tripId, name: 'X', url: 'https://example.com' },
      });
      expect(save.status()).toBe(401);
    }
    expect(await db.place.count({ where: { tripId } })).toBe(0);
  });

  test('one user token cannot write to another user trip', async ({
    page,
    context,
    request,
  }) => {
    const token = await generateToken(page, context);

    const stranger = await db.user.create({
      data: { email: `ext-stranger-${crypto.randomUUID()}@example.com` },
    });
    try {
      const strangerTrip = await db.trip.create({
        data: {
          userId: stranger.id,
          name: 'Not Yours',
          destinations: ['Kyoto'],
          startDate: new Date('2026-11-14'),
          endDate: new Date('2026-11-14'),
          baseCurrency: 'JPY',
          budgetMinor: 0,
        },
      });

      const save = await request.post('/api/extension/places', {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          tripId: strangerTrip.id,
          name: 'Kinkaku-ji',
          url: 'https://example.com/kyoto',
        },
      });

      // 404, not 403 — the same message the app uses, so the response can't
      // be used to work out which trip ids exist.
      expect(save.status()).toBe(404);
      expect(await db.place.count({ where: { tripId: strangerTrip.id } })).toBe(
        0,
      );
    } finally {
      await db.trip.deleteMany({ where: { userId: stranger.id } });
      await db.user.delete({ where: { id: stranger.id } });
    }
  });

  test('a revoked token stops working immediately', async ({
    page,
    context,
    request,
  }) => {
    const token = await generateToken(page, context);
    await page.getByRole('button', { name: /revoke/i }).click();
    await expect(page.getByText(/no token yet/i)).toBeVisible();

    const list = await request.get('/api/extension/trips', {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(list.status()).toBe(401);
  });

  test('answers 400, not 500, for JSON that is not an object', async ({
    page,
    context,
    request,
  }) => {
    const token = await generateToken(page, context);

    // `null`, `[]` and `"str"` are all valid JSON, so parsing succeeding does
    // not mean there are fields to read. A body of literal `null` used to
    // reach `body.tripId` and throw.
    for (const data of ['null', '[]', '"str"', '123']) {
      const response = await request.post('/api/extension/places', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        data,
      });
      expect(response.status()).toBe(400);
    }
  });

  test('rejects a javascript: URL', async ({ page, context, request }) => {
    const token = await generateToken(page, context);

    const save = await request.post('/api/extension/places', {
      headers: { Authorization: `Bearer ${token}` },
      data: { tripId, name: 'Evil', url: 'javascript:alert(1)' },
    });

    // The saved URL is rendered as a link in the app.
    expect(save.status()).toBe(422);
    expect(await db.place.count({ where: { tripId } })).toBe(0);
  });
});
