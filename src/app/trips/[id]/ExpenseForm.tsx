'use client';

import { useActionState, useEffect, useRef } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import type { ExpenseFormState } from './actions';

export function ExpenseForm({
  action,
}: {
  action: (
    prevState: ExpenseFormState,
    formData: FormData,
  ) => Promise<ExpenseFormState>;
}) {
  const [state, formAction] = useActionState(action, {});
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-3">
      {state.error && (
        <p
          className="w-full text-sm text-danger"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          {state.error}
        </p>
      )}
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Label</span>
        <input
          name="label"
          required
          autoComplete="off"
          placeholder="Label (e.g. Flights)"
          className="rounded border border-border-strong px-3 py-2 text-sm bg-transparent"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Category</span>
        <input
          name="category"
          required
          autoComplete="off"
          placeholder="Category"
          className="rounded border border-border-strong px-3 py-2 text-sm bg-transparent"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Amount</span>
        <input
          type="number"
          name="costAmount"
          required
          min="0"
          step="any"
          inputMode="decimal"
          placeholder="Amount"
          className="w-28 rounded border border-border-strong px-3 py-2 text-sm font-mono tabular-nums bg-transparent"
        />
      </label>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Currency</span>
        <input
          name="costCurrency"
          required
          maxLength={3}
          spellCheck={false}
          autoCapitalize="characters"
          placeholder="e.g. JPY"
          className="w-24 rounded border border-border-strong px-3 py-2 text-sm uppercase bg-transparent"
        />
      </label>
      <SubmitButton
        pendingLabel="Adding…"
        className="rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
      >
        Add expense
      </SubmitButton>
    </form>
  );
}
