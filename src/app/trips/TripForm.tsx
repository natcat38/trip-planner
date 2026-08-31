'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import type { TripFormState } from './actions';

export interface TripFormDefaults {
  name: string;
  destinations: string;
  startDate: string;
  endDate: string;
  baseCurrency: string;
  budgetAmount: string;
}

const emptyDefaults: TripFormDefaults = {
  name: '',
  destinations: '',
  startDate: '',
  endDate: '',
  baseCurrency: '',
  budgetAmount: '',
};

export function TripForm({
  action,
  defaults = emptyDefaults,
  submitLabel,
}: {
  action: (
    prevState: TripFormState,
    formData: FormData,
  ) => Promise<TripFormState>;
  defaults?: TripFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction] = useActionState(action, {});
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  return (
    <form
      action={formAction}
      onChange={() => setDirty(true)}
      className="flex flex-col gap-4 max-w-md"
    >
      {state.error && (
        <p
          className="text-sm text-danger"
          role="alert"
          tabIndex={-1}
          ref={errorRef}
        >
          {state.error}
        </p>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">Name</span>
        <input
          name="name"
          required
          autoComplete="off"
          defaultValue={defaults.name}
          className="rounded border border-border-strong px-3 py-2 bg-transparent"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">
          Destinations (comma-separated)
        </span>
        <input
          name="destinations"
          required
          autoComplete="off"
          defaultValue={defaults.destinations}
          className="rounded border border-border-strong px-3 py-2 bg-transparent"
        />
      </label>

      <div className="flex gap-4">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-sm font-medium text-foreground">
            Start date
          </span>
          <input
            type="date"
            name="startDate"
            required
            defaultValue={defaults.startDate}
            className="rounded border border-border-strong px-3 py-2 bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-sm font-medium text-foreground">End date</span>
          <input
            type="date"
            name="endDate"
            required
            defaultValue={defaults.endDate}
            className="rounded border border-border-strong px-3 py-2 bg-transparent"
          />
        </label>
      </div>

      <div className="flex gap-4">
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-sm font-medium text-foreground">
            Base currency
          </span>
          <input
            name="baseCurrency"
            required
            maxLength={3}
            placeholder="JPY"
            spellCheck={false}
            autoCapitalize="characters"
            defaultValue={defaults.baseCurrency}
            className="rounded border border-border-strong px-3 py-2 uppercase bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1 flex-1">
          <span className="text-sm font-medium text-foreground">
            Budget amount
          </span>
          <input
            type="number"
            name="budgetAmount"
            required
            min="0"
            step="any"
            inputMode="decimal"
            defaultValue={defaults.budgetAmount}
            className="rounded border border-border-strong px-3 py-2 bg-transparent"
          />
        </label>
      </div>

      <SubmitButton
        pendingLabel="Saving…"
        className="mt-2 rounded-full bg-accent px-5 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
      >
        {submitLabel}
      </SubmitButton>
    </form>
  );
}
