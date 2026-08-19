'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import type { Journey } from '@/lib/research/transitous';
import {
  createActivity,
  deleteActivity,
  moveActivity,
  updateActivity,
} from '@/server/itinerary';
import { createExpense, deleteExpense } from '@/server/expenses';
import { ignoreIfMissing } from '@/server/auth-scope';
import { StaleWriteError, ValidationError } from '@/server/errors';
import { planJourneyBetweenActivities } from '@/server/transit';

export interface ActivityFormState {
  error?: string;
}

export interface ExpenseFormState {
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
