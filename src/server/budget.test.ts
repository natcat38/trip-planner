import { beforeEach, describe, expect, it, vi } from 'vitest';
import { convertMinor } from '../lib/fx';
import { db } from '../lib/db';
import { requireTrip } from './auth-scope';
import { getBudgetSummary } from './budget';

vi.mock('./auth-scope', () => ({ requireTrip: vi.fn() }));
vi.mock('../lib/db', () => ({
  db: { activity: { findMany: vi.fn() }, expense: { findMany: vi.fn() } },
}));
vi.mock('../lib/fx', () => ({ convertMinor: vi.fn() }));

beforeEach(() => {
  vi.mocked(requireTrip).mockReset();
  vi.mocked(db.activity.findMany).mockReset();
  vi.mocked(db.expense.findMany).mockReset();
  vi.mocked(convertMinor).mockReset();
});

const trip = {
  id: 'trip-1',
  userId: 'user-1',
  budgetMinor: 350000,
  baseCurrency: 'JPY',
};

describe('getBudgetSummary', () => {
  it('sums converted activity and expense costs, computing remaining and over-budget status', async () => {
    vi.mocked(requireTrip).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findMany).mockResolvedValue([
      {
        id: 'a1',
        title: 'Dinner',
        category: 'Food',
        costMinor: 6000,
        costCurrency: 'EUR',
        day: { date: new Date('2026-09-01') },
      },
    ] as never);
    vi.mocked(db.expense.findMany).mockResolvedValue([
      {
        id: 'e1',
        label: 'Flights',
        category: 'Transport',
        costMinor: 12000000,
        costCurrency: 'JPY',
      },
    ] as never);
    vi.mocked(convertMinor).mockImplementation(async (amount, from) =>
      from === 'EUR' ? 990000 : amount,
    );

    const summary = await getBudgetSummary('trip-1');

    expect(summary.spentMinor).toBe(990000 + 12000000);
    expect(summary.remainingMinor).toBe(350000 - (990000 + 12000000));
    expect(summary.isOverBudget).toBe(true);
    expect(summary.unconvertedItems).toHaveLength(0);
  });

  it('groups converted amounts by category and by day (activities only)', async () => {
    vi.mocked(requireTrip).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findMany).mockResolvedValue([
      {
        id: 'a1',
        title: 'Lunch',
        category: 'Food',
        costMinor: 1000,
        costCurrency: 'JPY',
        day: { date: new Date('2026-09-01') },
      },
      {
        id: 'a2',
        title: 'Dinner',
        category: 'Food',
        costMinor: 2000,
        costCurrency: 'JPY',
        day: { date: new Date('2026-09-01') },
      },
    ] as never);
    vi.mocked(db.expense.findMany).mockResolvedValue([] as never);
    vi.mocked(convertMinor).mockImplementation(
      async (amount) => amount as number,
    );

    const summary = await getBudgetSummary('trip-1');

    expect(summary.byCategory).toEqual({ Food: 3000 });
    expect(summary.byDay).toEqual({ '2026-09-01': 3000 });
  });

  it('excludes items with no available rate from totals and lists them as unconverted', async () => {
    vi.mocked(requireTrip).mockResolvedValue(trip as never);
    vi.mocked(db.activity.findMany).mockResolvedValue([
      {
        id: 'a1',
        title: 'Souvenir',
        category: 'Other',
        costMinor: 500,
        costCurrency: 'GBP',
        day: { date: new Date('2026-09-01') },
      },
    ] as never);
    vi.mocked(db.expense.findMany).mockResolvedValue([] as never);
    vi.mocked(convertMinor).mockResolvedValue(null);

    const summary = await getBudgetSummary('trip-1');

    expect(summary.spentMinor).toBe(0);
    expect(summary.byCategory).toEqual({});
    expect(summary.unconvertedItems).toEqual([
      {
        id: 'a1',
        label: 'Souvenir',
        category: 'Other',
        originalMinor: 500,
        originalCurrency: 'GBP',
      },
    ]);
  });
});
