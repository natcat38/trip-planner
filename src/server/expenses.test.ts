import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { ForbiddenOrNotFoundError, requireTripAccess } from './auth-scope';
import { ValidationError } from './errors';
import { createExpense, deleteExpense, listExpenses } from './expenses';

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
    expense: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

beforeEach(() => {
  vi.mocked(requireTripAccess).mockReset();
  vi.mocked(db.expense.create).mockReset();
  vi.mocked(db.expense.findFirst).mockReset();
  vi.mocked(db.expense.findMany).mockReset();
  vi.mocked(db.expense.delete).mockReset();
});

const trip = { id: 'trip-1', userId: 'user-1' };

describe('listExpenses', () => {
  it("queries the trip's expenses after authorization", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.expense.findMany).mockResolvedValue([] as never);

    await listExpenses('trip-1');

    expect(db.expense.findMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1' },
      orderBy: { id: 'asc' },
    });
  });
});

describe('createExpense', () => {
  it('converts the cost to minor units and creates the expense', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.expense.create).mockResolvedValue({} as never);

    await createExpense('trip-1', {
      label: 'Flights',
      category: 'Transport',
      costAmount: 60,
      costCurrency: 'EUR',
    });

    expect(db.expense.create).toHaveBeenCalledWith({
      data: {
        tripId: 'trip-1',
        label: 'Flights',
        category: 'Transport',
        costMinor: 6000,
        costCurrency: 'EUR',
      },
    });
  });

  it('rejects a negative cost amount', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);

    await expect(
      createExpense('trip-1', {
        label: 'Flights',
        category: 'Transport',
        costAmount: -1,
        costCurrency: 'EUR',
      }),
    ).rejects.toThrow(ValidationError);
    expect(db.expense.create).not.toHaveBeenCalled();
  });

  it('rejects a malformed currency code', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);

    await expect(
      createExpense('trip-1', {
        label: 'Flights',
        category: 'Transport',
        costAmount: 60,
        costCurrency: 'EU',
      }),
    ).rejects.toThrow(ValidationError);
    expect(db.expense.create).not.toHaveBeenCalled();
  });
});

describe('deleteExpense', () => {
  it('deletes the expense after authorization', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.expense.findFirst).mockResolvedValue({
      id: 'expense-1',
      tripId: 'trip-1',
    } as never);
    vi.mocked(db.expense.delete).mockResolvedValue({} as never);

    await deleteExpense('trip-1', 'expense-1');

    expect(db.expense.delete).toHaveBeenCalledWith({
      where: { id: 'expense-1' },
    });
  });

  it("throws ForbiddenOrNotFoundError when the expense isn't scoped to the trip", async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.expense.findFirst).mockResolvedValue(null);

    await expect(deleteExpense('trip-1', 'expense-1')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});
