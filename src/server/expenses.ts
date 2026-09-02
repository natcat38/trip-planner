'use server';

import { db } from '../lib/db';
import { isValidCurrencyCode, toMinorUnits } from '../lib/money';
import { ForbiddenOrNotFoundError, requireTripAccess } from './auth-scope';
import { ValidationError } from './errors';
import { MAX_NAME_LENGTH, requireText } from './validation';

export interface ExpenseInput {
  label: string;
  category: string;
  costAmount: number;
  costCurrency: string;
}

// Server Actions hand this client-supplied FormData, so label/category have
// to be checked here rather than trusted from the form's own required
// attribute — same rationale as validateLabel in ./checklist.ts.
function validateExpenseInput(input: ExpenseInput) {
  requireText(
    input.label,
    'label',
    MAX_NAME_LENGTH,
    'Enter a label for this expense.',
  );
  requireText(
    input.category,
    'category',
    MAX_NAME_LENGTH,
    'Enter a category for this expense.',
  );
  if (!(input.costAmount >= 0)) {
    throw new ValidationError('Enter an amount of 0 or more.');
  }
  if (!isValidCurrencyCode(input.costCurrency)) {
    throw new ValidationError('Enter a valid 3-letter currency code.');
  }
}

export async function listExpenses(tripId: string) {
  const trip = await requireTripAccess(tripId);
  return db.expense.findMany({
    where: { tripId: trip.id },
    orderBy: { id: 'asc' },
  });
}

export async function createExpense(tripId: string, input: ExpenseInput) {
  const trip = await requireTripAccess(tripId);
  validateExpenseInput(input);
  return db.expense.create({
    data: {
      tripId: trip.id,
      label: input.label.trim(),
      category: input.category.trim(),
      costMinor: toMinorUnits(input.costAmount, input.costCurrency),
      costCurrency: input.costCurrency,
    },
  });
}

export async function deleteExpense(tripId: string, expenseId: string) {
  const trip = await requireTripAccess(tripId);
  const expense = await db.expense.findFirst({
    where: { id: expenseId, tripId: trip.id },
  });
  if (!expense) throw new ForbiddenOrNotFoundError();
  await db.expense.delete({ where: { id: expense.id } });
}
