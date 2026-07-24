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
      <input
        name="label"
        required
        placeholder="Label (e.g. Flights)"
        className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
      />
      <input
        name="category"
        required
        placeholder="Category"
        className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
      />
      <input
        type="number"
        name="costAmount"
        required
        min="0"
        step="any"
        placeholder="Amount"
        className="w-28 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
      />
      <input
        name="costCurrency"
        required
        maxLength={3}
        placeholder="Currency"
        className="w-24 rounded border border-black/[.08] px-3 py-2 text-sm uppercase dark:border-white/[.145] dark:bg-transparent"
      />
      <button
        type="submit"
        disabled={isPending}
        className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {isPending ? 'Adding…' : 'Add expense'}
      </button>
    </form>
  );
}
