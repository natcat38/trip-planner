'use server';

import { cache } from 'react';
import { convertMinor } from '../lib/fx';
import { db } from '../lib/db';
import { requireTripAccess } from './auth-scope';

export interface UnconvertedItem {
  id: string;
  label: string;
  category: string;
  originalMinor: number;
  originalCurrency: string;
}

export interface BudgetSummary {
  budgetMinor: number;
  baseCurrency: string;
  spentMinor: number;
  remainingMinor: number;
  isOverBudget: boolean;
  byCategory: Record<string, number>;
  byDay: Record<string, number>;
  unconvertedItems: UnconvertedItem[];
}

interface BudgetTrip {
  id: string;
  budgetMinor: number;
  baseCurrency: string;
}

// One shape for both an Activity's cost and an Expense's cost, so the roll-up
// below is a single loop instead of two near-identical copies. `date` is only
// ever set for activities — byDay tracking is activities-only (see the loop).
interface BudgetLineItem {
  id: string;
  label: string;
  category: string;
  amountMinor: number;
  currency: string;
  date?: string;
}

// Extracted from getBudgetSummary so the public share-link path (sharing.ts,
// token-gated instead of session-gated) can reuse the same roll-up math
// without going through requireTripAccess. cache()-wrapped for the same
// reason as requireShareToken in sharing.ts: no active caller re-invokes it
// with the same trip within a request today, but this keeps the two
// aligned and free going forward rather than a silent trap for the next
// caller who does.
export const summarizeBudget = cache(async function summarizeBudget(
  trip: BudgetTrip,
): Promise<BudgetSummary> {
  const [activities, expenses] = await Promise.all([
    db.activity.findMany({
      where: { day: { tripId: trip.id }, costMinor: { not: null } },
      include: { day: true },
    }),
    db.expense.findMany({ where: { tripId: trip.id } }),
  ]);

  const items: BudgetLineItem[] = [
    ...activities
      .filter(
        (
          activity,
        ): activity is typeof activity & {
          costMinor: number;
          costCurrency: string;
        } => activity.costMinor != null && !!activity.costCurrency,
      )
      .map((activity) => ({
        id: activity.id,
        label: activity.title,
        category: activity.category,
        amountMinor: activity.costMinor,
        currency: activity.costCurrency,
        date: activity.day.date.toISOString().slice(0, 10),
      })),
    ...expenses.map((expense) => ({
      id: expense.id,
      label: expense.label,
      category: expense.category,
      amountMinor: expense.costMinor,
      currency: expense.costCurrency,
    })),
  ];

  // One convertMinor call per distinct source currency (a representative
  // item's amount stands in for the rate), not one per line item — a trip
  // with dozens of same-currency expenses previously awaited convertMinor
  // that many times over. null means no rate was available for that
  // currency at all.
  const currencies = [...new Set(items.map((item) => item.currency))];
  const rateEntries = await Promise.all(
    currencies.map(async (currency) => {
      const sample = items.find((item) => item.currency === currency)!;
      const converted = await convertMinor(
        sample.amountMinor,
        currency,
        trip.baseCurrency,
      );
      const rate =
        converted == null
          ? null
          : sample.amountMinor === 0
            ? 1
            : converted / sample.amountMinor;
      return [currency, rate] as const;
    }),
  );
  const rates = new Map(rateEntries);

  const byCategory: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const unconvertedItems: UnconvertedItem[] = [];
  let spentMinor = 0;

  for (const item of items) {
    const rate = rates.get(item.currency);
    if (rate == null) {
      unconvertedItems.push({
        id: item.id,
        label: item.label,
        category: item.category,
        originalMinor: item.amountMinor,
        originalCurrency: item.currency,
      });
      continue;
    }
    const convertedMinor = Math.round(item.amountMinor * rate);
    spentMinor += convertedMinor;
    byCategory[item.category] =
      (byCategory[item.category] ?? 0) + convertedMinor;
    if (item.date != null) {
      byDay[item.date] = (byDay[item.date] ?? 0) + convertedMinor;
    }
  }

  return {
    budgetMinor: trip.budgetMinor,
    baseCurrency: trip.baseCurrency,
    spentMinor,
    remainingMinor: trip.budgetMinor - spentMinor,
    isOverBudget: spentMinor > trip.budgetMinor,
    byCategory,
    byDay,
    unconvertedItems,
  };
});

export async function getBudgetSummary(tripId: string): Promise<BudgetSummary> {
  const trip = await requireTripAccess(tripId);
  return summarizeBudget(trip);
}
