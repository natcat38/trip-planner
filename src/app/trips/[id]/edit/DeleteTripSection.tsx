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
      <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-3">
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
    </section>
  );
}
