import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';
import { formatMoney } from '@/lib/money';
import { getBudgetSummary } from '@/server/budget';
import { listExpenses } from '@/server/expenses';
import { addExpenseAction, deleteExpenseAction } from './actions';
import { ExpenseForm } from './ExpenseForm';
import { Card } from '@/components/Card';

export function budgetBannerText(
  spentMinor: number,
  budgetMinor: number,
  baseCurrency: string,
): string {
  const spent = formatMoney(spentMinor, baseCurrency);
  const budget = formatMoney(budgetMinor, baseCurrency);
  if (spentMinor > budgetMinor) {
    const overMinor = spentMinor - budgetMinor;
    const overPct =
      budgetMinor > 0 ? Math.round((overMinor / budgetMinor) * 100) : 100;
    return `Over budget by ${formatMoney(overMinor, baseCurrency)} — you're ${overPct}% above your ${budget} plan.`;
  }
  const pct =
    budgetMinor > 0 ? Math.round((spentMinor / budgetMinor) * 100) : 0;
  return `${spent} of ${budget} planned (${pct}%).`;
}

export async function BudgetPanel({ tripId }: { tripId: string }) {
  const [summary, expenses] = await Promise.all([
    getBudgetSummary(tripId),
    listExpenses(tripId),
  ]);

  return (
    <Card as="section" className="mb-10">
      <h2 className="font-medium text-black dark:text-zinc-50 mb-2">Budget</h2>
      <p
        className={
          summary.isOverBudget
            ? 'text-red-600 dark:text-red-400'
            : 'text-zinc-700 dark:text-zinc-300'
        }
      >
        {budgetBannerText(
          summary.spentMinor,
          summary.budgetMinor,
          summary.baseCurrency,
        )}
      </p>

      {Object.keys(summary.byCategory).length > 0 && (
        <ul className="mt-4 flex flex-col gap-1 text-sm text-zinc-600 dark:text-zinc-400">
          {Object.entries(summary.byCategory).map(([category, minor]) => (
            <li key={category} className="flex justify-between">
              <span>{category}</span>
              <span>{formatMoney(minor, summary.baseCurrency)}</span>
            </li>
          ))}
        </ul>
      )}

      {summary.unconvertedItems.length > 0 && (
        <ul className="mt-4 flex flex-col gap-1 text-sm text-amber-700 dark:text-amber-400">
          {summary.unconvertedItems.map((item) => (
            <li key={item.id}>
              {item.label}:{' '}
              {formatMoney(item.originalMinor, item.originalCurrency)} — Showing
              original amount — conversion rate unavailable, retrying.
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        <h3 className="text-sm font-medium text-black dark:text-zinc-50 mb-2">
          Expenses
        </h3>
        {expenses.length > 0 && (
          <ul className="flex flex-col gap-2 mb-4">
            {expenses.map((expense) => (
              <li
                key={expense.id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {expense.label} ({expense.category}) —{' '}
                  {formatMoney(expense.costMinor, expense.costCurrency)}
                </span>
                <form
                  action={deleteExpenseAction.bind(null, tripId, expense.id)}
                >
                  <ConfirmSubmitButton
                    confirm="Delete this expense?"
                    pendingLabel="Deleting…"
                    className="text-red-600 dark:text-red-400 underline"
                  >
                    Delete
                  </ConfirmSubmitButton>
                </form>
              </li>
            ))}
          </ul>
        )}
        <ExpenseForm action={addExpenseAction.bind(null, tripId)} />
      </div>
    </Card>
  );
}
