'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Journey } from '@/lib/research/transitous';
import {
  createActivity,
  deleteActivity,
  moveActivity,
  setActivityPinColor,
  updateActivity,
  updateDayNotes,
} from '@/server/itinerary';
import { addAttachment, deleteAttachment } from '@/server/attachments';
import {
  addChecklistItem,
  deleteChecklistItem,
  toggleChecklistItem,
} from '@/server/checklist';
import { createExpense, deleteExpense } from '@/server/expenses';
import { ignoreIfMissing } from '@/server/auth-scope';
import { StaleWriteError, ValidationError } from '@/server/errors';
import { planJourneyBetweenActivities } from '@/server/transit';
import { toggleVote } from '@/server/votes';

export interface ActivityFormState {
  error?: string;
}

export interface ExpenseFormState {
  error?: string;
}

export interface DayNotesFormState {
  error?: string;
}

export interface ChecklistFormState {
  error?: string;
}

export interface AttachmentFormState {
  error?: string;
}

function parseActivityFormData(formData: FormData) {
  const costAmountRaw = formData.get('costAmount');
  const hasCost = costAmountRaw != null && String(costAmountRaw).trim() !== '';
  return {
    title: String(formData.get('title') ?? ''),
    placeName: String(formData.get('placeName') ?? '') || undefined,
    startTime: String(formData.get('startTime') ?? '') || undefined,
    endTime: String(formData.get('endTime') ?? '') || undefined,
    category: String(formData.get('category') ?? ''),
    notes: String(formData.get('notes') ?? '') || undefined,
    costAmount: hasCost ? Number(costAmountRaw) : undefined,
    costCurrency: hasCost
      ? String(formData.get('costCurrency') ?? '').toUpperCase()
      : undefined,
  };
}

export async function addActivityAction(
  tripId: string,
  dayId: string,
  _prevState: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  try {
    await createActivity(tripId, dayId, parseActivityFormData(formData));
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/trips/${tripId}`);
  return {};
}

export async function updateActivityAction(
  tripId: string,
  activityId: string,
  updatedAt: string,
  _prevState: ActivityFormState,
  formData: FormData,
): Promise<ActivityFormState> {
  try {
    await updateActivity(tripId, activityId, {
      ...parseActivityFormData(formData),
      updatedAt: new Date(updatedAt),
    });
  } catch (err) {
    if (err instanceof ValidationError || err instanceof StaleWriteError)
      return { error: err.message };
    throw err;
  }
  redirect(`/trips/${tripId}`);
}

export async function deleteActivityAction(
  tripId: string,
  activityId: string,
): Promise<void> {
  await ignoreIfMissing(deleteActivity(tripId, activityId));
  revalidatePath(`/trips/${tripId}`);
}

export async function moveActivityAction(
  tripId: string,
  activityId: string,
  direction: 'up' | 'down',
): Promise<void> {
  await ignoreIfMissing(moveActivity(tripId, activityId, direction));
  revalidatePath(`/trips/${tripId}`);
}

// Bound per-swatch (color, or null for "default") the same way
// moveActivityAction is bound per-direction — the client picks which of a
// fixed palette to submit, but setActivityPinColor still re-validates the
// value server-side rather than trusting it, since a Server Action reference
// can be invoked directly with any string, not just via the rendered form.
export async function setActivityPinColorAction(
  tripId: string,
  activityId: string,
  color: string | null,
): Promise<void> {
  await setActivityPinColor(tripId, activityId, color);
  revalidatePath(`/trips/${tripId}`);
}

export async function toggleVoteAction(
  tripId: string,
  activityId: string,
): Promise<void> {
  await ignoreIfMissing(toggleVote(tripId, activityId));
  revalidatePath(`/trips/${tripId}`);
}

export async function updateDayNotesAction(
  tripId: string,
  dayId: string,
  updatedAt: string,
  _prevState: DayNotesFormState,
  formData: FormData,
): Promise<DayNotesFormState> {
  try {
    await updateDayNotes(
      tripId,
      dayId,
      String(formData.get('notes') ?? ''),
      new Date(updatedAt),
    );
  } catch (err) {
    if (err instanceof ValidationError || err instanceof StaleWriteError)
      return { error: err.message };
    throw err;
  }
  revalidatePath(`/trips/${tripId}`);
  return {};
}

function parseExpenseFormData(formData: FormData) {
  return {
    label: String(formData.get('label') ?? ''),
    category: String(formData.get('category') ?? ''),
    costAmount: Number(formData.get('costAmount')),
    costCurrency: String(formData.get('costCurrency') ?? '').toUpperCase(),
  };
}

export async function addExpenseAction(
  tripId: string,
  _prevState: ExpenseFormState,
  formData: FormData,
): Promise<ExpenseFormState> {
  try {
    await createExpense(tripId, parseExpenseFormData(formData));
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/trips/${tripId}`);
  return {};
}

export async function deleteExpenseAction(
  tripId: string,
  expenseId: string,
): Promise<void> {
  await deleteExpense(tripId, expenseId);
  revalidatePath(`/trips/${tripId}`);
}

export async function addChecklistItemAction(
  tripId: string,
  _prevState: ChecklistFormState,
  formData: FormData,
): Promise<ChecklistFormState> {
  try {
    await addChecklistItem(tripId, String(formData.get('label') ?? ''));
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/trips/${tripId}`);
  return {};
}

// Bound per-checkbox with the item's current done/updatedAt (the checkbox
// submits the OPPOSITE of its current state — see Checklist.tsx), the same
// bind-per-instance pattern as moveActivityAction/setActivityPinColorAction
// above. A stale write here (the trip changed elsewhere since the page
// loaded) surfaces as an uncaught error rather than a silent no-op: there's
// no useActionState wired to a bare checkbox toggle to show it inline, and
// letting the mutation silently fail would leave the checkbox visually wrong.
export async function toggleChecklistItemAction(
  tripId: string,
  itemId: string,
  done: boolean,
  updatedAt: string,
): Promise<void> {
  await toggleChecklistItem(tripId, itemId, done, new Date(updatedAt));
  revalidatePath(`/trips/${tripId}`);
}

export async function deleteChecklistItemAction(
  tripId: string,
  itemId: string,
): Promise<void> {
  await ignoreIfMissing(deleteChecklistItem(tripId, itemId));
  revalidatePath(`/trips/${tripId}`);
}

// `journeys` carries all three of planJourney's outcomes straight through:
// undefined (button not yet clicked), null (Transitous wasn't/couldn't be
// asked), [] (asked, confirmed no route), or a populated array. TransitLeg
// renders each of those distinctly — see docs/adr/0010.
export interface TransitFormState {
  journeys: Journey[] | null | undefined;
}

// Deliberately a no-op read: never mutates anything, so there's nothing here
// for CLAUDE.md's stale-write rule to apply to. Still gated through
// planJourneyBetweenActivities -> requireActivity -> requireTripAccess on
// every call, same as every other nested-resource access in this file.
export async function planTransitAction(
  tripId: string,
  fromActivityId: string,
  toActivityId: string,
  _prevState: TransitFormState,
  _formData: FormData,
): Promise<TransitFormState> {
  const journeys = await planJourneyBetweenActivities(
    tripId,
    fromActivityId,
    toActivityId,
  );
  return { journeys };
}

// Uploads run through a Server Action rather than the download route's shape
// because that is how every other mutation in this app is written. Note
// next.config.ts raises serverActions.bodySizeLimit — the 1 MB default would
// reject a file well under the per-attachment cap before this ever runs.
export async function addAttachmentAction(
  tripId: string,
  _prevState: AttachmentFormState,
  formData: FormData,
): Promise<AttachmentFormState> {
  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { error: 'Choose a file to upload.' };
  }
  try {
    await addAttachment(tripId, file);
  } catch (err) {
    if (err instanceof ValidationError) return { error: err.message };
    throw err;
  }
  revalidatePath(`/trips/${tripId}`);
  return {};
}

export async function deleteAttachmentAction(
  tripId: string,
  attachmentId: string,
): Promise<void> {
  await ignoreIfMissing(deleteAttachment(tripId, attachmentId));
  revalidatePath(`/trips/${tripId}`);
}
