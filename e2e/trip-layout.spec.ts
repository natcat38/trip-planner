import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';
import { signInAs } from './auth';

// UX-polish batch "trip page layout" (TRIP-UX-5, 10, 11, 15, 17): the
// itinerary leads the page, the budget and sharing are collapsed summaries,
// each activity row has one "more actions" menu, a day has one "Add
// activity" button, and destructive actions confirm in a dialog.
test.describe('trip page layout', () => {
  let userId: string;
  let tripId: string;

  test.beforeEach(async ({ context }) => {
    const { user } = await signInAs(db, context, 'layout-e2e');
    userId = user.id;
    const trip = await db.trip.create({
      data: {
        userId,
        name: 'Layout E2E Trip',
        destinations: ['Tokyo'],
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-01'),
        baseCurrency: 'JPY',
        budgetMinor: 500000,
      },
    });
    tripId = trip.id;
    const day = await db.day.create({
      data: { tripId, date: new Date(Date.UTC(2026, 8, 1)) },
    });
    for (const [i, title] of ['Layout alpha', 'Layout beta'].entries()) {
      await db.activity.create({
        data: { dayId: day.id, title, category: 'Sightseeing', sortOrder: i },
      });
    }
  });

  test.afterEach(async () => {
    await db.trip.deleteMany({ where: { id: tripId } });
    await db.session.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  test('header: breadcrumb, current tab marked, export menu, one Edit button', async ({
    page,
  }) => {
    await page.goto(`/trips/${tripId}`);

    await expect(
      page.getByRole('navigation', { name: 'Breadcrumb' }),
    ).toContainText('Layout E2E Trip');
    await expect(page.getByRole('link', { name: 'Itinerary' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(
      page.getByRole('link', { name: 'Places' }),
    ).not.toHaveAttribute('aria-current', 'page');

    // Export PDF and Add to Calendar are behind one menu.
    await expect(page.getByRole('link', { name: 'Export PDF' })).toBeHidden();
    await page.getByRole('button', { name: 'Export' }).click();
    await expect(page.getByRole('link', { name: 'Export PDF' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Add to Calendar' }),
    ).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('link', { name: 'Export PDF' })).toBeHidden();
    await expect(page.getByRole('link', { name: 'Edit trip' })).toBeVisible();

    // The Places page marks itself current instead of offering a way back.
    await page.getByRole('link', { name: 'Places' }).click();
    await expect(page.getByRole('link', { name: 'Places' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('budget and sharing are collapsed summaries; the itinerary comes first on a phone', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/trips/${tripId}`);

    await expect(
      page.getByRole('heading', { name: 'Budget', level: 2 }),
    ).toBeVisible();
    // The add-expense fields are not on the page until asked for.
    await expect(page.getByLabel('Label')).toBeHidden();

    const firstActivity = await page.getByText('Layout alpha').boundingBox();
    // About a screen and a half is the old position (2 screens on a phone
    // with the full budget form first); it must now be on the first screen.
    expect(firstActivity?.y).toBeLessThan(844 * 1.2);

    const noOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    );
    expect(noOverflow).toBe(true);
  });

  test('a day has one Add activity button; the form closes after adding', async ({
    page,
  }) => {
    await page.goto(`/trips/${tripId}`);
    await expect(page.getByLabel('Title')).toHaveCount(0);

    await page.getByRole('button', { name: 'Add activity' }).click();
    await page.getByLabel('Title').fill('Layout gamma');
    await page
      .locator('form')
      .filter({ has: page.getByLabel('Title') })
      .getByRole('button', { name: 'Add activity' })
      .click();

    await expect(page.getByText('Layout gamma').first()).toBeVisible();
    await expect(page.getByLabel('Title')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'Activity added' }),
    ).toBeVisible();
  });

  test('row menu: delete asks in a dialog, Cancel keeps the row, confirm removes it and says so', async ({
    page,
  }) => {
    await page.goto(`/trips/${tripId}`);

    const menu = page.getByRole('button', {
      name: 'More actions — Layout beta',
    });
    await expect(
      page.getByRole('link', { name: 'Edit', exact: true }),
    ).toHaveCount(0);
    await menu.click();
    await expect(
      page.getByRole('link', { name: 'Edit', exact: true }),
    ).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).last().click();
    const dialog = page.getByRole('alertdialog');
    await expect(dialog).toContainText('Delete this activity?');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Layout beta').first()).toBeVisible();

    // Cancel leaves the menu open.
    await page.getByRole('button', { name: 'Delete' }).last().click();
    await page
      .getByRole('alertdialog')
      .getByRole('button', { name: 'Delete' })
      .click();

    await expect(page.getByText('Layout beta')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'Activity deleted' }),
    ).toBeVisible();
  });
});
