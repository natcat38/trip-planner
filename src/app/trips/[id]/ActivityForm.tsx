'use client';

import { useActionState } from 'react';
import { Select } from '@/components/Select';
import { CATEGORIES } from '@/lib/categories';
import type { ActivityFormState } from './actions';

export interface ActivityFormDefaults {
  title: string;
  placeName: string;
  startTime: string;
  endTime: string;
  category: string;
  notes: string;
  costAmount: string;
  costCurrency: string;
}

const emptyDefaults: ActivityFormDefaults = {
  title: '',
  placeName: '',
  startTime: '',
  endTime: '',
  category: CATEGORIES[0],
  notes: '',
  costAmount: '',
  costCurrency: '',
};

export function ActivityForm({
  action,
  defaults = emptyDefaults,
  submitLabel,
}: {
  action: (
    prevState: ActivityFormState,
    formData: FormData,
  ) => Promise<ActivityFormState>;
  defaults?: ActivityFormDefaults;
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState(action, {});

  return (
    <form action={formAction} className="flex flex-col gap-3">
      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-black dark:text-zinc-50">
            Title
          </span>
          <input
            name="title"
            required
            autoComplete="off"
            placeholder="Title"
            defaultValue={defaults.title}
            className="rounded border border-border-strong px-3 py-2 text-sm bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-black dark:text-zinc-50">
            Category
          </span>
          <Select
            name="category"
            defaultValue={defaults.category}
            className="px-3 py-2 text-sm text-black dark:text-zinc-50"
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          Place
        </span>
        <input
          name="placeName"
          autoComplete="off"
          placeholder="Place (optional)"
          defaultValue={defaults.placeName}
          className="rounded border border-border-strong px-3 py-2 text-sm bg-transparent"
        />
      </label>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-black dark:text-zinc-50">
            Start
          </span>
          <input
            type="time"
            name="startTime"
            defaultValue={defaults.startTime}
            className="w-full rounded border border-border-strong px-3 py-2 text-sm bg-transparent"
          />
        </label>
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-black dark:text-zinc-50">
            End
          </span>
          <input
            type="time"
            name="endTime"
            defaultValue={defaults.endTime}
            className="w-full rounded border border-border-strong px-3 py-2 text-sm bg-transparent"
          />
        </label>
      </div>

      <div className="flex gap-3">
        <label className="flex flex-1 flex-col gap-1">
          <span className="text-sm font-medium text-black dark:text-zinc-50">
            Cost
          </span>
          <input
            type="number"
            name="costAmount"
            min="0"
            step="any"
            inputMode="decimal"
            placeholder="Cost (optional)"
            defaultValue={defaults.costAmount}
            className="w-full rounded border border-border-strong px-3 py-2 text-sm bg-transparent"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-black dark:text-zinc-50">
            Currency
          </span>
          <input
            name="costCurrency"
            maxLength={3}
            spellCheck={false}
            autoCapitalize="characters"
            placeholder="Currency"
            defaultValue={defaults.costCurrency}
            className="w-24 rounded border border-border-strong px-3 py-2 text-sm uppercase bg-transparent"
          />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-black dark:text-zinc-50">
          Notes
        </span>
        <textarea
          name="notes"
          autoComplete="off"
          placeholder="Notes (optional)"
          defaultValue={defaults.notes}
          className="rounded border border-border-strong px-3 py-2 text-sm bg-transparent"
        />
      </label>

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
      >
        {isPending ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
