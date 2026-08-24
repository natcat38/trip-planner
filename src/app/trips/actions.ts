'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import {
  createTrip,
  deleteTrip,
  duplicateTrip,
  updateTrip,
} from '@/server/trips';
import { acceptInvite, declineInvite } from '@/server/sharing';
import { ForbiddenOrNotFoundError, ignoreIfMissing } from '@/server/auth-scope';
import { StaleWriteError, ValidationError } from '@/server/errors';

export interface TripFormState {
  error?: string;
}

function parseTripFormData(formData: FormData) {
  return {
    name: String(formData.get('name') ?? ''),
    destinations: String(formData.get('destinations') ?? '')
      .split(',')
      .map((d) => d.trim())
      .filter(Boolean),
    startDate: new Date(String(formData.get('startDate'))),
    endDate: new Date(String(formData.get('endDate'))),
    baseCurrency: String(formData.get('baseCurrency') ?? '').toUpperCase(),
    budgetAmount: Number(formData.get('budgetAmount')),
  };
}

export async function createTripAction(
  _prevState: TripFormState,
  formData: FormData,
): Promise<TripFormState> {
  try {
    await createTrip(parseTripFormData(formData));
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  redirect('/trips');
}

export async function updateTripAction(
  tripId: string,
  updatedAt: string,
  _prevState: TripFormState,
  formData: FormData,
): Promise<TripFormState> {
  try {
    await updateTrip(tripId, {
      ...parseTripFormData(formData),
      updatedAt: new Date(updatedAt),
    });
  } catch (err) {
    if (
      err instanceof ValidationError ||
      err instanceof StaleWriteError ||
      err instanceof ForbiddenOrNotFoundError
    )
      return { error: err.message };
    throw err;
  }
  redirect('/trips');
}

export async function deleteTripAction(tripId: string): Promise<void> {
  await deleteTrip(tripId);
  redirect('/trips');
}

export async function duplicateTripAction(tripId: string): Promise<void> {
  const newTrip = await duplicateTrip(tripId);
  redirect(`/trips/${newTrip.id}`);
}

export async function acceptInviteAction(tripId: string): Promise<void> {
  await ignoreIfMissing(acceptInvite(tripId));
  revalidatePath('/trips');
}

export async function declineInviteAction(tripId: string): Promise<void> {
  await ignoreIfMissing(declineInvite(tripId));
  revalidatePath('/trips');
}
