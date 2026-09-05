// Pure budget roll-up math: folds activity/expense line items with their
// per-currency rates into totals. Lives outside the 'use server' module
// (src/server/budget.ts) because Next requires every export there to be
// async, and this is deliberately sync so it unit-tests without a DB.

export interface UnconvertedItem {
  id: string;
  label: string;
  category: string;
  originalMinor: number;
  originalCurrency: string;
}

// One shape for both an Activity's cost and an Expense's cost, so the roll-up
// below is a single loop instead of two near-identical copies. `date` is only
// ever set for activities — byDay tracking is activities-only (see the loop).
export interface BudgetLineItem {
  id: string;
  label: string;
  category: string;
  amountMinor: number;
  currency: string;
  date?: string;
}

export interface RollUpResult {
  byCategory: Record<string, number>;
  byDay: Record<string, number>;
  unconvertedItems: UnconvertedItem[];
  spentMinor: number;
}

// Pure: no I/O, no async. Takes each item's already-resolved per-currency
// conversion rate (null meaning no rate was available) and folds the line
// items into the totals getBudgetSummary/summarizeBudget expose. Split out
// of summarizeBudget so this arithmetic can be unit-tested without a DB or
// convertMinor's network call.
export function rollUp(
  items: BudgetLineItem[],
  rates: Map<string, number | null>,
): RollUpResult {
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

  return { byCategory, byDay, unconvertedItems, spentMinor };
}
