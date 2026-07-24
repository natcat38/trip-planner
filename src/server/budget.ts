'use server';

import { convertMinor } from '../lib/fx';
import { db } from '../lib/db';
import { requireTrip } from './auth-scope';

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

export async function getBudgetSummary(tripId: string): Promise<BudgetSummary> {
  const trip = await requireTrip(tripId);

  const [activities, expenses] = await Promise.all([
    db.activity.findMany({
      where: { day: { tripId: trip.id }, costMinor: { not: null } },
      include: { day: true },
    }),
    db.expense.findMany({ where: { tripId: trip.id } }),
  ]);

  const byCategory: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const unconvertedItems: UnconvertedItem[] = [];
  let spentMinor = 0;

  for (const activity of activities) {
    if (activity.costMinor == null || !activity.costCurrency) continue;
    const convertedMinor = await convertMinor(activity.costMinor, activity.costCurrency, trip.baseCurrency);
    if (convertedMinor == null) {
      unconvertedItems.push({
        id: activity.id,
        label: activity.title,
        category: activity.category,
        originalMinor: activity.costMinor,
        originalCurrency: activity.costCurrency,
      });
      continue;
    }
    spentMinor += convertedMinor;
    byCategory[activity.category] = (byCategory[activity.category] ?? 0) + convertedMinor;
    const date = activity.day.date.toISOString().slice(0, 10);
    byDay[date] = (byDay[date] ?? 0) + convertedMinor;
  }

  for (const expense of expenses) {
    const convertedMinor = await convertMinor(expense.costMinor, expense.costCurrency, trip.baseCurrency);
    if (convertedMinor == null) {
      unconvertedItems.push({
        id: expense.id,
        label: expense.label,
        category: expense.category,
        originalMinor: expense.costMinor,
        originalCurrency: expense.costCurrency,
      });
      continue;
    }
    spentMinor += convertedMinor;
    byCategory[expense.category] = (byCategory[expense.category] ?? 0) + convertedMinor;
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
}
