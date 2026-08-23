import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';
import { signInAs } from './auth';

// B8 extracted src/components/Select.tsx out of seven independent copies of
// the dark-mode select/option background fix. The extraction touches seven
// working forms, so a regression here (a dropped `name`, `defaultValue`, or
// `onChange` wire-up) breaks real form submissions, not just styling.
// e2e/places.spec.ts already exercises PlaceRow.tsx's dayId select
// end-to-end; this file covers the two other sites with real functional
// risk and no prior coverage. AiKeyPanel.tsx's model select and
// DayPlanner.tsx's selects aren't covered here for the same reason
// places.spec.ts avoids driving the OSM search live: they only render once
// an AI provider key/model list exists, which needs a live provider call
// and would make this suite flaky by design. places/page.tsx's category
// filter select is a plain GET-form control with no client JS, so a broken
// wire-up would be a build/type-level failure (caught by tsc), not a
// runtime one — omitted rather than adding a test that would need a real,
// live-geocoded destination against the same live Mapbox API this suite's
// other specs deliberately avoid depending on.
test.describe('ActivityForm category select', () => {
  let userId: string;
  let tripId: string;

  test.beforeEach(async ({ context }) => {
    const { user } = await signInAs(db, context, 'select-e2e');
    userId = user.id;

    const trip = await db.trip.create({
      data: {
        userId,
        name: 'Select E2E Trip',
        destinations: ['Tokyo'],
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

  test('picking a non-default category on the Add activity form persists it', async ({
    page,
  }) => {
    await page.goto(`/trips/${tripId}`);

    const addSection = page
      .locator('details')
      .filter({ hasText: 'Add activity' });
    await addSection.locator('summary').click();

    await addSection.getByLabel('Title').fill('Ride the bullet train');
    // CATEGORIES[0] ('Food') is the form's default — selecting a different
    // option is what actually exercises the Select wrapper's defaultValue
    // and onChange-free (name-only) form submission wiring.
    await addSection.getByLabel('Category').selectOption('Transport');
    await addSection.locator('button[type="submit"]').click();

    // Longer than the 5s default: this is a server-action round-trip plus a
    // revalidate and re-render, which overruns 5s on CI's two-core runner
    // under parallel load (it failed there while passing locally). The wait
    // is the point of the assertion, not an obstacle to it.
    const slow = { timeout: 20_000 };
    await expect(page.getByText('Ride the bullet train').first()).toBeVisible(
      slow,
    );
    await expect(page.getByText('(Transport)')).toBeVisible(slow);

    // Reload to prove the category was actually persisted server-side via
    // addActivityAction, not just reflected in client state.
    await page.reload();
    await expect(page.getByText('Ride the bullet train').first()).toBeVisible(
      slow,
    );
    await expect(page.getByText('(Transport)')).toBeVisible(slow);
  });
});

// ThemeToggle.tsx's select is the one site driven entirely by client state
// (value/onChange, no `name`, no form) rather than a server action — its own
// risk is that the Select extraction silently drops the onChange wiring,
// which no other spec would catch since ThemeToggle renders on every route.
//
// Only the immediate onChange effect is asserted here, not persistence
// across a reload: manual testing found the select's own displayed value
// reverts to "System theme" after a reload even though the class it applies
// and the underlying localStorage write both persist correctly — a
// pre-existing bug in ThemeToggle's readStoredPreference/hydration, present
// before this task's Select extraction (reproduced against the pre-B8
// component too) and out of this task's named-defects scope.
test.describe('ThemeToggle theme select', () => {
  test('choosing Dark applies the dark class and persists to storage', async ({
    page,
  }) => {
    await page.goto('/');

    const select = page.getByLabel('Theme');
    await expect(select).toBeVisible();
    await select.selectOption('dark');

    await expect(page.locator('html')).toHaveClass(/dark/);
    await expect(select).toHaveValue('dark');
    expect(await page.evaluate(() => localStorage.getItem('theme'))).toBe(
      'dark',
    );
  });
});
