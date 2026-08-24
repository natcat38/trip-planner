'use client';

import { useActionState } from 'react';
import type { ExpenseFormState } from './actions';

export function ExpenseForm({
  action,
}: {
  action: (
    prevState: ExpenseFormState,
    formData: FormData,
  ) => Promise<ExpenseFormState>;
}) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      {state.error && (
        <p
          className="w-full text-sm text-red-600 dark:text-red-400"
          role="alert"
        >
          {state.error}
        </p>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          Label
        </span>
        <input
          name="label"
          required
          autoComplete="off"
          placeholder="Label (e.g. Flights)"
          className="rounded border border-border px-3 py-2 text-sm bg-transparent"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          Category
        </span>
        <input
          name="category"
          required
          autoComplete="off"
          placeholder="Category"
          className="rounded border border-border px-3 py-2 text-sm bg-transparent"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          Amount
        </span>
        <input
          type="number"
          name="costAmount"
          required
          min="0"
          step="any"
          inputMode="decimal"
          placeholder="Amount"
          className="w-28 rounded border border-border px-3 py-2 text-sm bg-transparent"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          Currency
        </span>
        <input
          name="costCurrency"
          required
          maxLength={3}
          spellCheck={false}
          autoCapitalize="characters"
          placeholder="Currency"
          className="w-24 rounded border border-border px-3 py-2 text-sm uppercase bg-transparent"
        />
      </label>
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? 'Adding…' : 'Add expense'}
      </button>
    </form>
  );
}
