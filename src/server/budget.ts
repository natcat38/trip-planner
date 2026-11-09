'use server';

import { type BudgetSummary, summarizeBudget } from '../lib/budgetSummary';
import { requireTripAccess } from './auth-scope';

// Only gated exports belong in this file: `'use server'` publishes every
// export as a callable endpoint. The ungated roll-up lives in
// src/lib/budgetSummary.ts; useServer.directive.test.ts enforces this.
export async function getBudgetSummary(tripId: string): Promise<BudgetSummary> {
  const trip = await requireTripAccess(tripId);
  return summarizeBudget(trip);
}
