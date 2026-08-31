'use client';

import { useActionState, useEffect, useRef } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
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
  const [state, formAction] = useActionState<DayNotesFormState, FormData>(
    updateDayNotesAction.bind(null, tripId, dayId, updatedAt),
    {},
  );
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (state.error) errorRef.current?.focus();
  }, [state.error]);

  return (
    <details className="mt-4 rounded-lg border border-dashed border-border p-4">
      <summary className="cursor-pointer text-sm font-medium text-foreground">
        {notes ? 'Day notes' : 'Add day notes'}
      </summary>
      <form action={formAction} className="mt-4 flex flex-col gap-3">
        {state.error && (
          <p className="text-sm text-danger" role="alert" tabIndex={-1} ref={errorRef}>
            {state.error}
          </p>
        )}
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium text-foreground">Notes</span>
          <textarea
            name="notes"
            autoComplete="off"
            rows={3}
            placeholder="Notes for this day (optional)"
            defaultValue={notes ?? ''}
            className="rounded border border-border-strong px-3 py-2 text-sm bg-transparent"
          />
        </label>
        <SubmitButton
          pendingLabel="Saving…"
          className="self-start rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
        >
          Save notes
        </SubmitButton>
      </form>
    </details>
  );
}
