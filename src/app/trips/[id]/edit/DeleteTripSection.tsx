'use client';

import { useState } from 'react';
import { ConfirmSubmitButton } from '@/components/ConfirmSubmitButton';

// #7: isolates whole-trip delete into its own visually separated section and
// raises the friction beyond window.confirm — the button stays disabled
// until the typed text matches the trip name exactly, so a reflexive
// confirm-click can't fire the cascade delete by accident.
export function DeleteTripSection({
  tripName,
  action,
}: {
  tripName: string;
  action: (formData: FormData) => void;
}) {
  const [typed, setTyped] = useState('');

  return (
    <section className="mt-12 border-t border-danger/30 pt-6">
      <h2 className="text-sm font-semibold text-danger mb-2">Danger zone</h2>
      <p id="delete-trip-help" className="text-sm text-muted-fg mb-3">
        Deleting this trip removes all its days, activities, expenses and
        attachments. This cannot be undone. Type the trip name (
        <span className="font-medium">{tripName}</span>) to confirm.
      </p>
      <form action={action} className="flex flex-wrap items-center gap-3">
        <label className="flex flex-col gap-1">
          <span className="sr-only">Trip name to confirm deletion</span>
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            placeholder={tripName}
            aria-describedby="delete-trip-help"
            className="rounded border border-border-strong px-3 py-2 text-sm bg-transparent"
          />
        </label>
        <ConfirmSubmitButton
          confirm="Delete this trip and all its days, activities, expenses and attachments? This cannot be undone."
          pendingLabel="Deleting…"
          disabled={typed !== tripName}
          className="text-sm text-danger underline disabled:opacity-50 disabled:no-underline"
        >
          Delete trip
        </ConfirmSubmitButton>
      </form>
      {/* Mounted unconditionally so the live region exists before its text
          changes — a screen reader only announces updates to a region it
          already knows about. Gives non-sighted users the same "why is the
          button disabled" feedback sighted users get from watching it grey
          out (a11y-review.md §8). */}
      <p className="sr-only" aria-live="polite">
        {typed === ''
          ? ''
          : typed === tripName
            ? 'You can now delete this trip.'
            : 'Type the trip name exactly to enable delete.'}
      </p>
    </section>
  );
}
