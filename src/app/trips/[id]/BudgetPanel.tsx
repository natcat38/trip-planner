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

// Fixed opacity steps for the proportion bar's category segments. The app
// has exactly one saturated colour (--accent, ADR-0019 §2) — categories are
// distinguished by varying its opacity rather than by inventing a palette,
// and cycle if there are more categories than steps. Colour is never the
// *only* signal: every segment also carries an order position, a legend
// label, and a numeral (share % + amount) — see CategoryShareBar below.
const CATEGORY_OPACITIES = [1, 0.75, 0.55, 0.4, 0.25];

function categoryFill(index: number): string {
  const pct = Math.round(
    CATEGORY_OPACITIES[index % CATEGORY_OPACITIES.length] * 100,
  );
  return `color-mix(in srgb, var(--accent) ${pct}%, transparent)`;
}

// Stacked proportion bar of category shares (ADR-0019 §4). `pct` here is a
// display-only derivation — each category's share of `spentMinor` — computed
// fresh on every render from the already-returned BudgetSummary and never
// written back anywhere. It does not touch summary.byCategory, does not
// change the integer-minor-unit amounts rendered alongside it, and has no
// effect on the arithmetic in src/server/budget.ts.
export function CategoryShareBar({
  byCategory,
  spentMinor,
  currency,
}: {
  byCategory: Record<string, number>;
  spentMinor: number;
  currency: string;
}) {
  const entries = Object.entries(byCategory);
  if (entries.length === 0 || spentMinor <= 0) return null;

  const shares = entries.map(([category, minor], index) => ({
    category,
    minor,
    index,
    // Display-only: this category's share of total spend, for bar width and
    // the legend's "%" column. Rounding here is presentational only — it
    // never feeds back into any stored or returned money value.
    pct: (minor / spentMinor) * 100,
  }));

  return (
    <div className="mt-4">
      {/* Decorative: the legend below is the accessible version of this
          same information (label + % + amount, in the same order as the
          segments), so the bar itself is hidden from assistive tech rather
          than announced twice. */}
      <div
        aria-hidden="true"
        className="flex h-3 w-full overflow-hidden rounded-full border border-border"
      >
        {shares.map((s) => (
          <div
            key={s.category}
            className="h-full border-r border-surface-raised last:border-r-0"
            style={{
              width: `${s.pct}%`,
              backgroundColor: categoryFill(s.index),
            }}
          />
        ))}
      </div>
      <ul className="mt-2 grid grid-cols-[1fr_auto_auto] gap-x-3 gap-y-1 text-sm text-zinc-600 dark:text-zinc-400">
        {shares.map((s) => (
          <li key={s.category} className="contents">
            <span className="flex items-center gap-2 truncate">
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full border border-border"
                style={{ backgroundColor: categoryFill(s.index) }}
              />
              {s.category}
            </span>
            <span className="font-mono tabular-nums text-right">
              {Math.round(s.pct)}%
            </span>
            <span className="font-mono tabular-nums text-right">
              {formatMoney(s.minor, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export async function BudgetPanel({ tripId }: { tripId: string }) {
  const [summary, expenses] = await Promise.all([
    getBudgetSummary(tripId),
    listExpenses(tripId),
  ]);

  // Display-only: how far over/under budget, as a magnitude for the large
  // departure-board figure. summary.remainingMinor (budgetMinor - spentMinor)
  // is already computed, untouched, in src/server/budget.ts — this just picks
  // a sign-free amount and a label to show alongside it.
  const figureMinor = Math.abs(summary.remainingMinor);
  const figureLabel = summary.isOverBudget ? 'over budget' : 'remaining';

  return (
    <Card as="section" className="mb-10">
      <h2 className="text-lg font-medium text-black dark:text-zinc-50 mb-2">
        Budget
      </h2>

      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 mb-2">
        <span
          className={`inline-flex items-baseline rounded-full px-4 py-1.5 font-mono tabular-nums text-4xl font-semibold ${
            summary.isOverBudget
              ? 'bg-danger text-danger-fg'
              : 'bg-positive text-positive-fg'
          }`}
        >
          {formatMoney(figureMinor, summary.baseCurrency)}
        </span>
        <span className="text-sm text-zinc-600 dark:text-zinc-400">
          {figureLabel}
        </span>
      </div>

      <p
        className={
          summary.isOverBudget
            ? 'text-danger text-sm'
            : 'text-zinc-700 dark:text-zinc-300 text-sm'
        }
      >
        {budgetBannerText(
          summary.spentMinor,
          summary.budgetMinor,
          summary.baseCurrency,
        )}
      </p>

      {Object.keys(summary.byCategory).length > 0 && (
        <CategoryShareBar
          byCategory={summary.byCategory}
          spentMinor={summary.spentMinor}
          currency={summary.baseCurrency}
        />
      )}

      {summary.unconvertedItems.length > 0 && (
        <div className="mt-4 rounded-lg bg-warning p-3">
          <ul className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm text-warning-fg">
            {summary.unconvertedItems.map((item) => (
              <li key={item.id} className="contents">
                <span>
                  {item.label} — showing original amount, conversion rate
                  unavailable, retrying.
                </span>
                <span className="font-mono tabular-nums text-right">
                  {formatMoney(item.originalMinor, item.originalCurrency)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-6">
        <h3 className="text-15 font-medium text-black dark:text-zinc-50 mb-2">
          Expenses
        </h3>
        {expenses.length > 0 && (
          <ul className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 gap-y-2 mb-4 text-sm">
            {expenses.map((expense) => (
              <li key={expense.id} className="contents">
                <span>
                  {expense.label} ({expense.category})
                </span>
                <span className="font-mono tabular-nums text-right">
                  {formatMoney(expense.costMinor, expense.costCurrency)}
                </span>
                <form
                  action={deleteExpenseAction.bind(null, tripId, expense.id)}
                  className="justify-self-end"
                >
                  <ConfirmSubmitButton
                    confirm="Delete this expense?"
                    pendingLabel="Deleting…"
                    className="text-danger underline"
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
