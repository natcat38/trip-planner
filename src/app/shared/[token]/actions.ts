'use server';

import { redirect } from 'next/navigation';
import { duplicateSharedTrip } from '@/server/sharing';
import { withFormErrors } from '@/server/auth-scope';
import { RateLimitError } from '@/server/errors';

export interface DuplicateFormState {
  error?: string;
}

// A visitor hammering "Save a copy" past DUPLICATE_LIMIT (src/server/
// sharing.ts) used to crash to Next's generic error.tsx, since
// duplicateSharedTrip's RateLimitError propagated uncaught — the only path
// left it could take, because a Server Action has no HTTP status to set.
// withFormErrors turns it into a `{ error }` result instead, so
// DuplicateCopyForm can render it inline like every other form error in the
// app (see auth-scope.ts's withFormErrors doc comment).
export const duplicateSharedTripAction = withFormErrors(
  async (
    token: string,
    _prevState: DuplicateFormState,
    _formData: FormData,
  ): Promise<DuplicateFormState> => {
    const newTrip = await duplicateSharedTrip(token);
    redirect(`/trips/${newTrip.id}`);
  },
  [RateLimitError],
);
