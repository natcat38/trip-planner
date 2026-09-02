'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/SubmitButton';
import { duplicateSharedTripAction, type DuplicateFormState } from './actions';

// A Client Component so it can render duplicateSharedTripAction's error
// inline (useActionState needs a client boundary) instead of letting a
// RateLimitError crash the whole page to Next's generic error.tsx — the same
// error-display shape TripForm/SharingPanel use elsewhere.
export function DuplicateCopyForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<DuplicateFormState, FormData>(
    duplicateSharedTripAction.bind(null, token),
    {},
  );
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <SubmitButton
        pendingLabel="Saving…"
        className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-accent-fg hover:opacity-90"
      >
        Save a copy
      </SubmitButton>
      {state.error && (
        <p className="text-sm text-danger" role="alert">
          {state.error}
        </p>
      )}
    </form>
  );
}
