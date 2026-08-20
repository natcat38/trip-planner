'use client';

import { useActionState } from 'react';
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
        <p className="text-sm text-red-600 dark:text-red-400" role="alert">
          {state.error}
        </p>
      )}

      <div className="flex gap-3">
        <input
          name="title"
          required
          placeholder="Title"
          defaultValue={defaults.title}
          className="flex-1 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
        />
        <select
          name="category"
          defaultValue={defaults.category}
          className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>

      <input
        name="placeName"
        placeholder="Place (optional)"
        defaultValue={defaults.placeName}
        className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
      />

      <div className="flex gap-3">
        <input
          type="time"
          name="startTime"
          defaultValue={defaults.startTime}
          className="flex-1 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
        />
        <input
          type="time"
          name="endTime"
          defaultValue={defaults.endTime}
          className="flex-1 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
        />
      </div>

      <div className="flex gap-3">
        <input
          type="number"
          name="costAmount"
          min="0"
          step="any"
          placeholder="Cost (optional)"
          defaultValue={defaults.costAmount}
          className="flex-1 rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
        />
        <input
          name="costCurrency"
          maxLength={3}
          placeholder="Currency"
          defaultValue={defaults.costCurrency}
          className="w-24 rounded border border-black/[.08] px-3 py-2 text-sm uppercase dark:border-white/[.145] dark:bg-transparent"
        />
      </div>

      <textarea
        name="notes"
        placeholder="Notes (optional)"
        defaultValue={defaults.notes}
        className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
      />

      <button
        type="submit"
        disabled={isPending}
        className="self-start rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
      >
        {isPending ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
