'use server';

/**
 * The trip checklist (Phase 3 M5): packing lists and to-dos scoped to a
 * trip rather than a day. Mirrors src/server/places.ts's shape — a
 * `requireChecklistItem` gate mirroring `requirePlace`, and the same
 * `updateMany` + `updatedAt` stale-write rejection per ADR-0003.
 * @packageDocumentation
 */

import { db } from '../lib/db';
import { ForbiddenOrNotFoundError, requireTripAccess } from './auth-scope';
import { optimisticUpdate } from './errors';
import { MAX_NAME_LENGTH, requireText } from './validation';

export async function requireChecklistItem(tripId: string, itemId: string) {
  const trip = await requireTripAccess(tripId);
  const item = await db.checklistItem.findFirst({
    where: { id: itemId, tripId: trip.id },
  });
  if (!item) throw new ForbiddenOrNotFoundError();
  return item;
}

export async function listChecklist(tripId: string) {
  const trip = await requireTripAccess(tripId);
  return db.checklistItem.findMany({
    where: { tripId: trip.id },
    orderBy: { sortOrder: 'asc' },
  });
}

export async function addChecklistItem(tripId: string, label: string) {
  const trip = await requireTripAccess(tripId);
  const trimmedLabel = requireText(
    label,
    'checklist item',
    MAX_NAME_LENGTH,
    'Enter a checklist item.',
  );
  const maxSortOrder = await db.checklistItem.aggregate({
    where: { tripId: trip.id },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSortOrder._max.sortOrder ?? -1) + 1;
  return db.checklistItem.create({
    data: { tripId: trip.id, label: trimmedLabel, sortOrder },
  });
}

export async function toggleChecklistItem(
  tripId: string,
  itemId: string,
  done: boolean,
  updatedAt: Date,
) {
  const item = await requireChecklistItem(tripId, itemId);
  await optimisticUpdate(
    db.checklistItem.updateMany({
      where: { id: item.id, updatedAt },
      data: { done },
    }),
  );
}

export async function deleteChecklistItem(tripId: string, itemId: string) {
  const item = await requireChecklistItem(tripId, itemId);
  await db.checklistItem.delete({ where: { id: item.id } });
}
