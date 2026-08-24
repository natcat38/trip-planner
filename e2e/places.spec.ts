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
// the OSM search UI (see knowledge/integrations/research-sources.md):
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

  // B9: getGuide() is streamed behind its own <Suspense> boundary
  // (GuidePanelAsync in page.tsx) instead of being awaited by the page
  // component itself, so a slow/unreachable Wikivoyage fetch can no longer
  // hold up the rest of the page. The random destination guarantees a real
  // network round-trip to en.wikivoyage.org (same fetch the test above
  // relies on) — that's genuine, uncontrolled latency this test leans on
  // rather than mocks. `waitUntil: 'commit'` returns as soon as the
  // navigation starts, well before the response body (let alone the guide's
  // fetch) can have finished, so seeing the search section immediately
  // after it — well inside the guide fetch's own round-trip time — is only
  // possible if that section's HTML streamed in independently of the guide.
  // If the streaming boundary regressed back to a blocking await, this
  // section wouldn't paint until the guide fetch resolved too.
  test('the search section streams in without waiting on the destination guide fetch', async ({
    page,
  }) => {
    await page.goto(`/trips/${tripId}/places`, { waitUntil: 'commit' });

    await expect(
      page.getByRole('heading', { name: 'Search places' }),
    ).toBeVisible({
      timeout: 3_000,
    });

    // The guide fetch does eventually resolve and render its own content —
    // this isn't a race the search section merely happened to win.
    await expect(
      page.getByText(/Limited guide data for Zzyzxnonexistent-/),
    ).toBeVisible();
  });

  // B9: trips/[id]/page.tsx and places/page.tsx now call notFound() for
  // ForbiddenOrNotFoundError instead of rendering their own bare-<p>
  // message — this must render the app's shared not-found.tsx (not a 500,
  // not a blank page), and must stay indistinguishable from a genuinely
  // missing trip (ForbiddenOrNotFoundError deliberately conflates the two —
  // see the class's own doc comment in src/server/auth-scope.ts).
  test('a different signed-in user gets the same not-found page for a forbidden trip as for a missing one', async ({
    page,
    context,
  }) => {
    const { user: otherUser } = await signInAs(db, context, 'places-e2e-other');
    try {
      await page.goto(`/trips/${tripId}`);
      await expect(
        page.getByRole('heading', { name: 'Page not found' }),
      ).toBeVisible();
      await expect(
        page.getByRole('link', { name: 'Back to trips' }),
      ).toBeVisible();

      await page.goto('/trips/does-not-exist-at-all/places');
      await expect(
        page.getByRole('heading', { name: 'Page not found' }),
      ).toBeVisible();
    } finally {
      await db.session.deleteMany({ where: { userId: otherUser.id } });
      await db.user.delete({ where: { id: otherUser.id } });
    }
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

    // The marker only exists once Mapbox has fetched its style over the
    // network, which loses the race against the default timeout when the
    // suite's workers compete for bandwidth. Passes in isolation either way.
    const pin = page.getByRole('button', { name: 'Fushimi Inari Taisha' });
    await expect(pin).toBeVisible({ timeout: 20_000 });
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

// Separate from the describe above because that one's trip uses a nonsense
// destination on purpose (to make the guide fetch fail closed) — which means
// geocode() finds no centre and the search form is never rendered at all.
// The search UI needs a destination that really geocodes.
test.describe('places search form', () => {
  let userId: string;
  let tripId: string;

  test.beforeEach(async ({ context }) => {
    const { user } = await signInAs(db, context, 'places-search-e2e');
    userId = user.id;
    const trip = await db.trip.create({
      data: {
        userId,
        name: 'Search E2E Trip',
        destinations: ['Kyoto'],
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-01'),
        baseCurrency: 'JPY',
        budgetMinor: 500000,
      },
    });
    tripId = trip.id;
  });

  test.afterEach(async () => {
    await db.trip.deleteMany({ where: { id: tripId } });
    await db.session.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  // The search form is next/form, not a bare <form method="get">: a native
  // GET submit is a full browser navigation that useFormStatus cannot see,
  // which would make the "Searching…" pending state purely decorative.
  // Assert the pending label rather than the resulting URL — next/form
  // commits the new URL only once the server render finishes, and rendering
  // ?q= runs a live Overpass search whose latency is somebody else's
  // network. Covering the wait is the whole point of the pending state.
  test('submitting the search shows a pending state while it runs', async ({
    page,
  }) => {
    test.skip(
      !process.env.MAPBOX_TOKEN,
      'needs MAPBOX_TOKEN to geocode the destination the search form requires',
    );
    await page.goto(`/trips/${tripId}/places`);

    const search = page.getByRole('searchbox', { name: 'Search places' });
    await expect(search).toBeVisible();
    await search.fill('ramen');
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(
      page.getByRole('button', { name: 'Searching…' }),
    ).toBeVisible();
  });
});
