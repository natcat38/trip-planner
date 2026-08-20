import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { ForbiddenOrNotFoundError, requireTripAccess } from './auth-scope';
import { StaleWriteError, ValidationError } from './errors';
import {
  addChecklistItem,
  deleteChecklistItem,
  listChecklist,
  requireChecklistItem,
  toggleChecklistItem,
} from './checklist';

// Mocked as a plain factory (not importOriginal) so this never touches the real
// auth-scope.ts -> ../auth -> next-auth -> next/server chain — same rationale
// as places.test.ts.
vi.mock('./auth-scope', () => {
  class ForbiddenOrNotFoundError extends Error {
    constructor() {
      super("That trip doesn't exist or you don't have access.");
    }
  }
  return { requireTripAccess: vi.fn(), ForbiddenOrNotFoundError };
});
vi.mock('../lib/db', () => ({
  db: {
    checklistItem: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      aggregate: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.mocked(requireTripAccess).mockReset();
  vi.mocked(db.checklistItem.findFirst).mockReset();
  vi.mocked(db.checklistItem.findMany).mockReset();
  vi.mocked(db.checklistItem.create).mockReset();
  vi.mocked(db.checklistItem.aggregate).mockReset();
  vi.mocked(db.checklistItem.updateMany).mockReset();
  vi.mocked(db.checklistItem.delete).mockReset();
});

const trip = { id: 'trip-1', userId: 'user-1' };

const item = {
  id: 'item-1',
  tripId: 'trip-1',
  label: 'Pack the charger',
  done: false,
  sortOrder: 0,
  updatedAt: new Date('2026-08-01T00:00:00.000Z'),
};

describe('every exported function refuses when requireTripAccess rejects', () => {
  const denied = new ForbiddenOrNotFoundError();

  beforeEach(() => {
    vi.mocked(requireTripAccess).mockRejectedValue(denied);
  });

  it('requireChecklistItem', async () => {
    await expect(requireChecklistItem('trip-1', 'item-1')).rejects.toBe(denied);
    expect(db.checklistItem.findFirst).not.toHaveBeenCalled();
  });

  it('listChecklist', async () => {
    await expect(listChecklist('trip-1')).rejects.toBe(denied);
    expect(db.checklistItem.findMany).not.toHaveBeenCalled();
  });

  it('addChecklistItem', async () => {
    await expect(addChecklistItem('trip-1', 'Buy sunscreen')).rejects.toBe(
      denied,
    );
    expect(db.checklistItem.create).not.toHaveBeenCalled();
  });

  it('toggleChecklistItem', async () => {
    await expect(
      toggleChecklistItem('trip-1', 'item-1', true, new Date()),
    ).rejects.toBe(denied);
    expect(db.checklistItem.updateMany).not.toHaveBeenCalled();
  });

  it('deleteChecklistItem', async () => {
    await expect(deleteChecklistItem('trip-1', 'item-1')).rejects.toBe(denied);
    expect(db.checklistItem.delete).not.toHaveBeenCalled();
  });
});

describe('listChecklist', () => {
  it('lists the checklist for the trip, ordered by sortOrder', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.checklistItem.findMany).mockResolvedValue([item] as never);

    const result = await listChecklist('trip-1');

    expect(db.checklistItem.findMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1' },
      orderBy: { sortOrder: 'asc' },
    });
    expect(result).toEqual([item]);
  });
});

describe('addChecklistItem', () => {
  it('rejects a blank label', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);

    // Reachable from a crafted Server Action POST — the page's own input is
    // required, but that's client-side only.
    await expect(addChecklistItem('trip-1', '   ')).rejects.toThrow(
      ValidationError,
    );
    expect(db.checklistItem.create).not.toHaveBeenCalled();
  });

  it('assigns the next sortOrder and creates the item', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.checklistItem.aggregate).mockResolvedValue({
      _max: { sortOrder: 1 },
    } as never);
    vi.mocked(db.checklistItem.create).mockResolvedValue(item as never);

    await addChecklistItem('trip-1', 'Pack the charger');

    expect(db.checklistItem.create).toHaveBeenCalledWith({
      data: { tripId: 'trip-1', label: 'Pack the charger', sortOrder: 2 },
    });
  });

  it('starts sortOrder at 0 for the first item', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.checklistItem.aggregate).mockResolvedValue({
      _max: { sortOrder: null },
    } as never);
    vi.mocked(db.checklistItem.create).mockResolvedValue(item as never);

    await addChecklistItem('trip-1', 'Pack the charger');

    expect(db.checklistItem.create).toHaveBeenCalledWith({
      data: { tripId: 'trip-1', label: 'Pack the charger', sortOrder: 0 },
    });
  });
});

describe('toggleChecklistItem', () => {
  const updatedAt = new Date('2026-08-01T00:00:00.000Z');

  it('toggles done after authorization', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.checklistItem.findFirst).mockResolvedValue(item as never);
    vi.mocked(db.checklistItem.updateMany).mockResolvedValue({
      count: 1,
    } as never);

    await toggleChecklistItem('trip-1', 'item-1', true, updatedAt);

    expect(db.checklistItem.updateMany).toHaveBeenCalledWith({
      where: { id: 'item-1', updatedAt },
      data: { done: true },
    });
  });

  it('throws StaleWriteError when the item changed since it was read', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.checklistItem.findFirst).mockResolvedValue(item as never);
    vi.mocked(db.checklistItem.updateMany).mockResolvedValue({
      count: 0,
    } as never);

    await expect(
      toggleChecklistItem('trip-1', 'item-1', true, updatedAt),
    ).rejects.toThrow(StaleWriteError);
  });
});

describe('deleteChecklistItem', () => {
  it('deletes the item after authorization', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.checklistItem.findFirst).mockResolvedValue(item as never);
    vi.mocked(db.checklistItem.delete).mockResolvedValue({} as never);

    await deleteChecklistItem('trip-1', 'item-1');

    expect(db.checklistItem.delete).toHaveBeenCalledWith({
      where: { id: 'item-1' },
    });
  });

  it("throws ForbiddenOrNotFoundError when the item isn't scoped to the trip", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.checklistItem.findFirst).mockResolvedValue(null);

    await expect(
      deleteChecklistItem('trip-1', 'item-1'),
    ).rejects.toBeInstanceOf(ForbiddenOrNotFoundError);
  });
});
