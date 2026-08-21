import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';
import { signInAs } from './auth';

// B7 (WCAG target sizes) turned the checklist toggle from a <button> into a
// real <input type="checkbox"> inside a <label> wrapping the item text, so
// the whole row is one hit target instead of a 20px square. That's a real
// control swap (native checked semantics instead of aria-pressed on a
// button, and the Server Action is now called directly from useTransition
// rather than via a bound form action — see the comments on
// ChecklistCheckbox in src/app/trips/[id]/Checklist.tsx and on
// toggleChecklistItemAction in src/app/trips/[id]/actions.ts for why), and
// no existing spec drove this toggle at all. This is that coverage: it
// proves clicking the checkbox both flips the visible state and persists
// through toggleChecklistItemAction, surviving a reload.
test.describe('trip checklist toggle', () => {
  let userId: string;
  let tripId: string;

  test.beforeEach(async ({ context }) => {
    const { user } = await signInAs(db, context, 'checklist-e2e');
    userId = user.id;

    const trip = await db.trip.create({
      data: {
        userId,
        name: 'Checklist E2E Trip',
        destinations: ['Osaka'],
        startDate: new Date('2026-09-01'),
        endDate: new Date('2026-09-05'),
        baseCurrency: 'JPY',
        budgetMinor: 500000,
      },
    });
    tripId = trip.id;

    await db.checklistItem.create({
      data: {
        tripId,
        label: 'Pack passport',
        sortOrder: 0,
      },
    });
  });

  test.afterEach(async () => {
    await db.checklistItem.deleteMany({ where: { tripId } });
    await db.trip.deleteMany({ where: { id: tripId } });
    await db.session.deleteMany({ where: { userId } });
    await db.user.deleteMany({ where: { id: userId } });
  });

  test('clicking the checkbox toggles the item done and persists it', async ({
    page,
  }) => {
    await page.goto(`/trips/${tripId}`);

    const disclosure = page.getByText('Checklist (0/1)');
    await expect(disclosure).toBeVisible();
    await disclosure.click();

    const checkbox = page.getByRole('checkbox', { name: 'Pack passport' });
    await expect(checkbox).toBeVisible();
    await expect(checkbox).not.toBeChecked();

    await checkbox.click();

    await expect(checkbox).toBeChecked();
    await expect(page.getByText('Checklist (1/1)')).toBeVisible();

    // Reload to prove the toggle actually persisted server-side (via
    // toggleChecklistItemAction) rather than only flipping client state.
    await page.reload();
    const disclosureAfterReload = page.getByText('Checklist (1/1)');
    await expect(disclosureAfterReload).toBeVisible();
    await disclosureAfterReload.click();
    await expect(
      page.getByRole('checkbox', { name: 'Pack passport' }),
    ).toBeChecked();
  });
});
