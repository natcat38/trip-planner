import 'dotenv/config';
import crypto from 'node:crypto';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';
import { signInAs } from './auth';

// Matches this repo's existing e2e pattern (see e2e/export.spec.ts,
// e2e/sharing.spec.ts) of verifying the redirect/render boundary rather
// than a full OAuth click-through (no test OAuth account exists in CI).
test('the places page redirects to sign-in when signed out', async ({
  page,
}) => {
  const response = await page.goto('/trips/nonexistent-id/places');
  await expect(page).toHaveURL(/\/api\/auth\/signin/);
  expect(response?.ok()).toBe(true);
});

// These tests exercise a real signed-in session end to end without any OAuth
// provider or credentials: Auth.js uses database sessions, so a valid
// session is created directly via Prisma and the cookie is set via
// Playwright's context.addCookies() (same technique as e2e/export.spec.ts).
//
// The saved Place is seeded directly via Prisma rather than driven through
// the OSM search UI (docs/phase-3-research-layer-handoff.md §6 item 7):
// searching would hit the live Overpass API from CI, which is both flaky
// and rude to a fair-use community service. Its costCurrency matches the
// trip's baseCurrency so the budget assertion doesn't depend on a live FX
// rate (src/lib/fx.ts's convertMinor short-circuits when from === to).
test.describe('places page, signed in', () => {
  let userId: string;
  let tripId: string;

  test.beforeEach(async ({ context }) => {
    const { user } = await signInAs(db, context, 'places-e2e');
    userId = user.id;

    // A random, nonsense destination guarantees Wikivoyage's one-shot search
    // (resolveTitle in src/lib/research/wikivoyage.ts) finds no matching
    // page, so the page's incidental live guide fetch fails closed into the
    // "no usable guide" branch deterministically — this test never depends
    // on, or asserts against, real Wikivoyage content.
    const trip = await db.trip.create({
      data: {
        userId,
        name: 'Places E2E Trip',
        destinations: [`Zzyzxnonexistent-${crypto.randomUUID()}`],
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-01'),
        baseCurrency: 'JPY',
        budgetMinor: 500000,
      },
    });
    tripId = trip.id;

    await db.place.create({
      data: {
        tripId,
        source: 'manual',
        name: 'Fushimi Inari Taisha',
        lat: 34.9671,
        lng: 135.7727,
        category: 'Sightseeing',
        costMinor: 50000,
        costCurrency: 'JPY',
      },
    });
  });

  test.afterEach(async () => {
    await db.tripCollaborator.deleteMany({ where: { tripId } });
    await db.trip.deleteMany({ where: { id: tripId } });
    await db.session.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  test('renders the degrade-honestly guide state instead of a blank panel', async ({
    page,
  }) => {
    const response = await page.goto(`/trips/${tripId}/places`);
    expect(response?.ok()).toBe(true);

    await expect(
      page.getByText(/Limited guide data for Zzyzxnonexistent-/),
    ).toBeVisible();

    // B6: DayPlanner's results area is a live region mounted at page load
    // (this destination has no API key/guide, so GuideSummary never renders
    // here — its own live region isn't exercisable without a live guide and
    // a stored AI key, which would make this test flaky by design).
    const liveRegion = page.locator('[aria-live="polite"]');
    await expect(liveRegion).toHaveCount(1);
    await expect(liveRegion).toHaveAttribute('aria-busy', 'false');
  });

  test('the map renders a keyboard-focusable, labelled pin for each saved place', async ({
    page,
  }) => {
    // Without a token Map.tsx renders its "no Mapbox token configured"
    // fallback instead of a map, so there is no region and no pin to find.
    // CI has no token by design (it is a paid quota, ADR-0001) — this runs
    // locally, the same bargain e2e/extension-api.spec.ts makes for geocoding.
    test.skip(
      !process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
      'needs NEXT_PUBLIC_MAPBOX_TOKEN to render a real map',
    );
    const response = await page.goto(`/trips/${tripId}/places`);
    expect(response?.ok()).toBe(true);

    // B6: pins are real <button>s now, not inert <div>s — reachable by
    // keyboard and named to assistive tech via aria-label. The container
    // itself is a labelled region.
    await expect(
      page.getByRole('region', { name: 'Map of itinerary places' }),
    ).toBeVisible();

    const pin = page.getByRole('button', { name: 'Fushimi Inari Taisha' });
    await expect(pin).toBeVisible();
    await pin.focus();
    await expect(pin).toBeFocused();
  });

  test('adding a saved place to a day puts it on the itinerary with its cost counted in the budget', async ({
    page,
  }) => {
    const response = await page.goto(`/trips/${tripId}/places`);
    expect(response?.ok()).toBe(true);

    const placeRow = page
      .locator('li')
      .filter({ hasText: 'Fushimi Inari Taisha' });
    await expect(placeRow).toBeVisible();

    const daySelect = placeRow.locator('select[name="dayId"]');
    await daySelect.selectOption({ index: 0 });

    const [addResponse] = await Promise.all([
      page.waitForResponse(
        (res) =>
          res.request().method() === 'POST' &&
          res.url() === `http://localhost:3000/trips/${tripId}/places`,
      ),
      placeRow.getByRole('button', { name: 'Add to day' }).click(),
    ]);
    expect(addResponse.ok()).toBe(true);

    const tripResponse = await page.goto(`/trips/${tripId}`);
    expect(tripResponse?.ok()).toBe(true);

    // The activity's title and placeName are both "Fushimi Inari Taisha"
    // (addActivityFromPlace in src/server/places.ts sets both from the saved
    // place), so two separate <p> lines in ItineraryDays.tsx match the text
    // — .first() picks the title line without over-asserting on markup.
    await expect(page.getByText('Fushimi Inari Taisha').first()).toBeVisible();
    // costMinor 50000 in JPY (0 decimal places) formats as ¥50,000; budgetMinor
    // 500000 as ¥500,000 — see budgetBannerText in ./BudgetPanel.tsx.
    await expect(
      page.getByText('¥50,000 of ¥500,000 planned (10%).'),
    ).toBeVisible();
  });
});
