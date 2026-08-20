'use client';

import { useActionState } from 'react';
import { updateDayNotesAction, type DayNotesFormState } from './actions';

// A <details>-disclosed textarea, saved on submit — same shape as
// PlaceRow.tsx's edit form (bind the day's current updatedAt into the action
// so a stale write is caught server-side, same as every other mutation here).
export function DayNotesForm({
  tripId,
  dayId,
  updatedAt,
  notes,
}: {
  tripId: string;
  dayId: string;
  updatedAt: string;
  notes: string | null;
}) {
  const [state, formAction, isPending] = useActionState<
    DayNotesFormState,
    FormData
  >(updateDayNotesAction.bind(null, tripId, dayId, updatedAt), {});

  return (
    <details className="mt-4 rounded-lg border border-dashed border-black/[.08] p-4 dark:border-white/[.145]">
      <summary className="cursor-pointer text-sm font-medium text-black dark:text-zinc-50">
        {notes ? 'Day notes' : 'Add day notes'}
      </summary>
      <form action={formAction} className="mt-4 flex flex-col gap-3">
        {state.error && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {state.error}
          </p>
        )}
        <textarea
          name="notes"
          placeholder="Notes for this day (optional)"
          defaultValue={notes ?? ''}
          className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
        />
        <button
          type="submit"
          disabled={isPending}
          className="self-start rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
        >
          {isPending ? 'Saving…' : 'Save notes'}
        </button>
      </form>
    </details>
  );
}
