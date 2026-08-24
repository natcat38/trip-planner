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
import { ignoreIfMissing, withFormErrors } from '@/server/auth-scope';
import { ValidationError } from '@/server/errors';

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

export const createTripAction = withFormErrors(
  async (
    _prevState: TripFormState,
    formData: FormData,
  ): Promise<TripFormState> => {
    await createTrip(parseTripFormData(formData));
    redirect('/trips');
  },
  [ValidationError],
);

export const updateTripAction = withFormErrors(
  async (
    tripId: string,
    updatedAt: string,
    _prevState: TripFormState,
    formData: FormData,
  ): Promise<TripFormState> => {
    await updateTrip(tripId, {
      ...parseTripFormData(formData),
      updatedAt: new Date(updatedAt),
    });
    redirect('/trips');
  },
);

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
