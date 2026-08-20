'use server';

import { redirect } from 'next/navigation';
import { duplicateSharedTrip } from '@/server/sharing';

export async function duplicateSharedTripAction(token: string): Promise<void> {
  const newTrip = await duplicateSharedTrip(token);
  redirect(`/trips/${newTrip.id}`);
}
