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

  it('trims label and category before persisting', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(db.expense.create).mockResolvedValue({} as never);

    await createExpense('trip-1', {
      label: '  Flights  ',
      category: '  Transport  ',
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

  it('rejects a blank label', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);

    await expect(
      createExpense('trip-1', {
        label: '   ',
        category: 'Transport',
        costAmount: 60,
        costCurrency: 'EUR',
      }),
    ).rejects.toThrow(ValidationError);
    expect(db.expense.create).not.toHaveBeenCalled();
  });

  it('rejects a label over the max length', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);

    await expect(
      createExpense('trip-1', {
        label: 'a'.repeat(201),
        category: 'Transport',
        costAmount: 60,
        costCurrency: 'EUR',
      }),
    ).rejects.toThrow(ValidationError);
    expect(db.expense.create).not.toHaveBeenCalled();
  });

  it('rejects a blank category', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);

    await expect(
      createExpense('trip-1', {
        label: 'Flights',
        category: '   ',
        costAmount: 60,
        costCurrency: 'EUR',
      }),
    ).rejects.toThrow(ValidationError);
    expect(db.expense.create).not.toHaveBeenCalled();
  });

  it('rejects a category over the max length', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);

    await expect(
      createExpense('trip-1', {
        label: 'Flights',
        category: 'a'.repeat(201),
        costAmount: 60,
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

  // Regression for parseExpenseFormData (trips/[id]/actions.ts): an absent
  // costAmount now parses to NaN rather than 0, so a request with no amount
  // at all is rejected here the same way a negative one is, instead of
  // silently creating a free "$0" expense.
  it('rejects a NaN cost amount (an absent form field, not an explicit 0)', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);

    await expect(
      createExpense('trip-1', {
        label: 'Flights',
        category: 'Transport',
        costAmount: NaN,
        costCurrency: 'EUR',
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
