import 'dotenv/config';
import { expect, test } from '@playwright/test';
import { db } from '../src/lib/db';
import { signInAs } from './auth';

// Duplicate is the one bare-mutation site B4 (pending-state sweep) singles
// out as worth an e2e assertion: duplicateTrip() (src/server/trips.ts) does
// one sequential Prisma call per place/day/activity/expense inside a single
// transaction, so it is genuinely slow — the button giving zero feedback
// between click and redirect was the worst offender the sweep found. This
// seeds enough rows that the pending frame is reliably observable rather
// than a coin flip against local Postgres.
test.describe('trips list', () => {
  test('duplicating a trip shows a pending state before the copy appears', async ({
    page,
    context,
  }) => {
    const { user } = await signInAs(db, context, 'trips-e2e');
    const trip = await db.trip.create({
      data: {
        userId: user.id,
        name: 'Duplicate Me',
        destinations: ['Kyoto'],
        startDate: new Date('2026-11-01'),
        endDate: new Date('2026-11-10'),
        baseCurrency: 'JPY',
        budgetMinor: 100000,
      },
    });
    try {
      // 10 days x 3 activities = 30 sequential row copies, plus a handful of
      // expenses — enough sequential round trips against local Postgres for
      // the pending frame to be reliably catchable, not a coin flip.
      for (let i = 0; i < 10; i++) {
        const day = await db.day.create({
          data: {
            tripId: trip.id,
            date: new Date(Date.UTC(2026, 10, 1 + i)),
          },
        });
        for (let j = 0; j < 3; j++) {
          await db.activity.create({
            data: {
              dayId: day.id,
              title: `Activity ${i}-${j}`,
              category: 'Sightseeing',
              sortOrder: j,
            },
          });
        }
      }
      for (let i = 0; i < 5; i++) {
        await db.expense.create({
          data: {
            tripId: trip.id,
            label: `Expense ${i}`,
            category: 'Other',
            costMinor: 1000,
            costCurrency: 'JPY',
          },
        });
      }

      await page.goto('/trips');
      const row = page
        .getByRole('listitem')
        .filter({ hasText: 'Duplicate Me' });
      const duplicateButton = row.getByRole('button', { name: 'Duplicate' });
      await expect(duplicateButton).toBeVisible();

      await duplicateButton.click();

      // The pending frame: label swaps and the control disables while the
      // transaction and redirect are in flight. If SubmitButton's
      // useFormStatus() wiring ever regresses to a no-op, this is what would
      // stop passing — the click would go straight to the redirect with no
      // observable state in between.
      await expect(
        row.getByRole('button', { name: 'Duplicating…' }),
      ).toBeVisible();
      await expect(
        row.getByRole('button', { name: 'Duplicating…' }),
      ).toBeDisabled();

      // Completion: duplicateTripAction redirects to the new trip's own page.
      await expect(
        page.getByRole('heading', { name: 'Duplicate Me (copy)' }),
      ).toBeVisible();
    } finally {
      await db.trip.deleteMany({ where: { userId: user.id } });
      await db.session.deleteMany({ where: { userId: user.id } });
      await db.user.delete({ where: { id: user.id } });
    }
  });
});
