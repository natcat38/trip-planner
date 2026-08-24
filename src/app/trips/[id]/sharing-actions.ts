'use server';

import { revalidatePath } from 'next/cache';
import {
  enableShareLink,
  inviteCollaborator,
  removeCollaborator,
  revokeShareLink,
} from '@/server/sharing';
import { ignoreIfMissing } from '@/server/auth-scope';
import { ValidationError } from '@/server/errors';

export interface InviteFormState {
  error?: string;
}

export async function enableShareLinkAction(
  tripId: string,
  updatedAt: string,
): Promise<void> {
  await enableShareLink(tripId, new Date(updatedAt));
  revalidatePath(`/trips/${tripId}`);
}

export async function revokeShareLinkAction(
  tripId: string,
  updatedAt: string,
): Promise<void> {
  await ignoreIfMissing(revokeShareLink(tripId, new Date(updatedAt)));
  revalidatePath(`/trips/${tripId}`);
}

export async function inviteCollaboratorAction(
  tripId: string,
  _prevState: InviteFormState,
  formData: FormData,
): Promise<InviteFormState> {
  try {
    await inviteCollaborator(tripId, String(formData.get('email') ?? ''));
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/trips/${tripId}`);
  return {};
}

export async function removeCollaboratorAction(
  tripId: string,
  collaboratorId: string,
): Promise<void> {
  await ignoreIfMissing(removeCollaborator(tripId, collaboratorId));
  revalidatePath(`/trips/${tripId}`);
}
