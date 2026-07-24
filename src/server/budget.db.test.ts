import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { __resetFxCacheForTests } from '../lib/fx';
import { db } from '../lib/db';
import { getBudgetSummary } from './budget';

// Real Postgres and real fx.ts conversion math; only the external HTTP call is stubbed.
vi.mock('../auth', () => ({ auth: vi.fn() }));

let userId: string;
let tripId: string;

beforeEach(async () => {
  process.env.EXCHANGE_RATE_API_KEY = 'test-key';
  __resetFxCacheForTests();

  const user = await db.user.create({ data: { email: `budget-db-test-${crypto.randomUUID()}@example.com` } });
  userId = user.id;
  vi.mocked(auth).mockResolvedValue({ user: { id: userId } } as never);

  const trip = await db.trip.create({
    data: {
      userId,
      name: 'Japan Trip',
      destinations: ['Tokyo'],
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-01'),
      baseCurrency: 'JPY',
      budgetMinor: 20000,
    },
  });
  tripId = trip.id;
  const day = await db.day.create({ data: { tripId, date: new Date('2026-09-01') } });
  await db.activity.create({
    data: { dayId: day.id, title: 'Lunch', category: 'Food', sortOrder: 0, costMinor: 1500, costCurrency: 'JPY' },
  });
});

afterEach(async () => {
  await db.trip.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
  vi.unstubAllGlobals();
});

describe('getBudgetSummary against a real database', () => {
  it('rolls up same-currency costs without needing any FX call', async () => {
    vi.stubGlobal('fetch', vi.fn());

    const summary = await getBudgetSummary(tripId);

    expect(summary.spentMinor).toBe(1500);
    expect(summary.remainingMinor).toBe(20000 - 1500);
    expect(summary.isOverBudget).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('converts a cross-currency expense using the real fx.ts pipeline against a real trip', async () => {
    await db.expense.create({
      data: { tripId, label: 'Flights', category: 'Transport', costMinor: 6000, costCurrency: 'EUR' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ result: 'success', base_code: 'EUR', conversion_rates: { JPY: 165 } }),
      }),
    );

    const summary = await getBudgetSummary(tripId);

    // €60.00 * 165 = ¥9,900, plus the ¥1,500 lunch from beforeEach
    expect(summary.spentMinor).toBe(9900 + 1500);
    expect(summary.byCategory.Transport).toBe(9900);
    expect(summary.isOverBudget).toBe(false); // budgetMinor is 20000; 9900 + 1500 = 11400
    expect(summary.unconvertedItems).toHaveLength(0);
  });

  it('excludes an item from the total and lists it as unconverted when the rate fetch fails', async () => {
    await db.expense.create({
      data: { tripId, label: 'Souvenir', category: 'Other', costMinor: 500, costCurrency: 'GBP' },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const summary = await getBudgetSummary(tripId);

    expect(summary.spentMinor).toBe(1500); // only the JPY lunch counted
    expect(summary.unconvertedItems).toEqual([
      { id: expect.any(String), label: 'Souvenir', category: 'Other', originalMinor: 500, originalCurrency: 'GBP' },
    ]);
  });
});
