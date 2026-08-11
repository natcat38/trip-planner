# Phase 2 — Trip Sharing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a trip owner share a trip via a public read-only link and invite named co-editors (accept/decline, full edit rights once accepted), per `docs/superpowers/specs/2026-08-11-phase2-sharing-export-design.md`.

**Architecture:** Extend the existing `requireTrip`-style authorization chain in `src/server/auth-scope.ts` into `requireTripAccess` (owner or accepted collaborator) and `requireTripOwner` (owner only) — every existing nested-resource call site swaps to one of these two, so itinerary/budget/expense CRUD opens to collaborators for free. A new `TripCollaborator` model (email-matched, no `userId` FK) backs invites; a new `shareToken` column on `Trip` backs the public link. A new `src/server/sharing.ts` module owns everything sharing-specific: link management, invite/accept/decline, and the public (session-less) read path.

**Tech Stack:** Next.js App Router Server Actions, Prisma/Postgres, Vitest (mocked `.test.ts` + real-Postgres `.db.test.ts`), Playwright.

---

## Task 1: Schema — `Trip.shareToken` + `TripCollaborator`

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add the fields**

In `prisma/schema.prisma`, add `shareToken` and the `collaborators` relation to `model Trip` (insert after `budgetMinor Int`, before `updatedAt`):

```prisma
  budgetMinor  Int // budget in base currency MINOR units
  shareToken   String?   @unique // set = public read-only link enabled; null = disabled
  updatedAt    DateTime  @updatedAt
  user         User      @relation(fields: [userId], references: [id])
  days         Day[]
  expenses     Expense[]
  collaborators TripCollaborator[]
```

Add a new model after `model Expense { ... }`:

```prisma
model TripCollaborator {
  // Invited by email, matched against the signed-in session's verified OAuth
  // email at access time — no userId FK, no separate invite-acceptance table.
  id        String   @id @default(cuid())
  tripId    String
  email     String
  status    String   @default("PENDING") // PENDING | ACCEPTED
  createdAt DateTime @default(now())
  trip      Trip     @relation(fields: [tripId], references: [id], onDelete: Cascade)

  @@unique([tripId, email])
  @@index([tripId])
  @@index([email])
}
```

- [ ] **Step 2: Start the local stack and migrate**

```bash
docker compose up -d db
npx prisma migrate dev --name add_trip_sharing
```

Expected: migration applies cleanly, Prisma Client regenerates (via the `prisma generate` that `migrate dev` runs).

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma prisma/migrations
git commit -m "feat: add Trip.shareToken and TripCollaborator to schema"
```

---

## Task 2: `auth-scope.ts` — `requireTripAccess` + `requireTripOwner` (TDD)

**Files:**
- Modify: `src/server/auth-scope.ts`
- Modify: `src/server/auth-scope.test.ts`

- [ ] **Step 1: Write the failing tests**

Replace the full contents of `src/server/auth-scope.test.ts` with:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import {
  currentUserEmail,
  currentUserId,
  ForbiddenOrNotFoundError,
  requireTripAccess,
  requireTripOwner,
  UnauthenticatedError,
} from './auth-scope';

vi.mock('../auth', () => ({ auth: vi.fn() }));
vi.mock('../lib/db', () => ({ db: { trip: { findFirst: vi.fn() } } }));

beforeEach(() => {
  vi.mocked(auth).mockReset();
  vi.mocked(db.trip.findFirst).mockReset();
});

describe('currentUserId', () => {
  it('returns the session user id when signed in', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    await expect(currentUserId()).resolves.toBe('user-1');
  });

  it('throws UnauthenticatedError when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(currentUserId()).rejects.toBeInstanceOf(UnauthenticatedError);
  });
});

describe('currentUserEmail', () => {
  it('returns the session user email when signed in', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', email: 'a@example.com' },
    } as never);
    await expect(currentUserEmail()).resolves.toBe('a@example.com');
  });

  it('throws UnauthenticatedError when there is no session', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);
    await expect(currentUserEmail()).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
  });
});

describe('requireTripAccess', () => {
  it('returns the trip when owned by or shared (accepted) with the current user', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', email: 'a@example.com' },
    } as never);
    const trip = { id: 'trip-1', userId: 'user-1' };
    vi.mocked(db.trip.findFirst).mockResolvedValue(trip as never);

    await expect(requireTripAccess('trip-1')).resolves.toBe(trip);
    expect(db.trip.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'trip-1',
        OR: [
          { userId: 'user-1' },
          {
            collaborators: {
              some: { email: 'a@example.com', status: 'ACCEPTED' },
            },
          },
        ],
      },
    });
  });

  it('throws ForbiddenOrNotFoundError when neither owner nor an accepted collaborator', async () => {
    vi.mocked(auth).mockResolvedValue({
      user: { id: 'user-1', email: 'a@example.com' },
    } as never);
    vi.mocked(db.trip.findFirst).mockResolvedValue(null);

    await expect(requireTripAccess('trip-2')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });

  it('throws UnauthenticatedError when there is no session, without querying the trip', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    await expect(requireTripAccess('trip-1')).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    expect(db.trip.findFirst).not.toHaveBeenCalled();
  });
});

describe('requireTripOwner', () => {
  it('returns the trip when owned by the current user', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    const trip = { id: 'trip-1', userId: 'user-1' };
    vi.mocked(db.trip.findFirst).mockResolvedValue(trip as never);

    await expect(requireTripOwner('trip-1')).resolves.toBe(trip);
    expect(db.trip.findFirst).toHaveBeenCalledWith({
      where: { id: 'trip-1', userId: 'user-1' },
    });
  });

  it('throws ForbiddenOrNotFoundError when not owned (e.g. an accepted collaborator)', async () => {
    vi.mocked(auth).mockResolvedValue({ user: { id: 'user-1' } } as never);
    vi.mocked(db.trip.findFirst).mockResolvedValue(null);

    await expect(requireTripOwner('trip-2')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });

  it('throws UnauthenticatedError when there is no session, without querying the trip', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    await expect(requireTripOwner('trip-1')).rejects.toBeInstanceOf(
      UnauthenticatedError,
    );
    expect(db.trip.findFirst).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/server/auth-scope.test.ts`
Expected: FAIL — `requireTripAccess`, `requireTripOwner`, `currentUserEmail` are not exported.

- [ ] **Step 3: Implement**

Replace the full contents of `src/server/auth-scope.ts` with:

```ts
import { auth } from '../auth';
import { db } from '../lib/db';

export class UnauthenticatedError extends Error {
  constructor() {
    super('Not signed in.');
  }
}

export class ForbiddenOrNotFoundError extends Error {
  constructor() {
    super("That trip doesn't exist or you don't have access.");
  }
}

export async function currentUserId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthenticatedError();
  return session.user.id;
}

export async function currentUserEmail(): Promise<string> {
  const session = await auth();
  if (!session?.user?.email) throw new UnauthenticatedError();
  return session.user.email;
}

// Owner OR an accepted collaborator — the gate every nested resource
// (Day/Activity/Expense) and the trip's own reads/edits go through.
export async function requireTripAccess(tripId: string) {
  const session = await auth();
  if (!session?.user?.id) throw new UnauthenticatedError();
  const userId = session.user.id;
  const email = session.user.email ?? undefined;

  const trip = await db.trip.findFirst({
    where: {
      id: tripId,
      OR: [
        { userId },
        ...(email
          ? [{ collaborators: { some: { email, status: 'ACCEPTED' } } }]
          : []),
      ],
    },
  });
  if (!trip) throw new ForbiddenOrNotFoundError();
  return trip;
}

// Owner only — deleting the trip and managing sharing itself.
export async function requireTripOwner(tripId: string) {
  const userId = await currentUserId();
  const trip = await db.trip.findFirst({ where: { id: tripId, userId } });
  if (!trip) throw new ForbiddenOrNotFoundError();
  return trip;
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/server/auth-scope.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/auth-scope.ts src/server/auth-scope.test.ts
git commit -m "feat: split requireTrip into requireTripAccess and requireTripOwner"
```

---

## Task 3: `auth-scope.db.test.ts` — real-Postgres access matrix

**Files:**
- Create: `src/server/auth-scope.db.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import {
  ForbiddenOrNotFoundError,
  requireTripAccess,
  requireTripOwner,
} from './auth-scope';

vi.mock('../auth', () => ({ auth: vi.fn() }));

let ownerId: string;
let ownerEmail: string;
let collaboratorId: string;
let collaboratorEmail: string;
let tripId: string;

beforeEach(async () => {
  ownerEmail = `owner-${crypto.randomUUID()}@example.com`;
  collaboratorEmail = `collaborator-${crypto.randomUUID()}@example.com`;
  const owner = await db.user.create({ data: { email: ownerEmail } });
  const collaborator = await db.user.create({
    data: { email: collaboratorEmail },
  });
  ownerId = owner.id;
  collaboratorId = collaborator.id;

  const trip = await db.trip.create({
    data: {
      userId: ownerId,
      name: 'Shared Trip',
      destinations: ['Tokyo'],
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-05'),
      baseCurrency: 'JPY',
      budgetMinor: 100000,
    },
  });
  tripId = trip.id;
});

afterEach(async () => {
  await db.tripCollaborator.deleteMany({ where: { tripId } });
  await db.trip.deleteMany({ where: { id: tripId } });
  await db.user.deleteMany({
    where: { id: { in: [ownerId, collaboratorId] } },
  });
});

function signInAs(userId: string, email: string) {
  vi.mocked(auth).mockResolvedValue({ user: { id: userId, email } } as never);
}

describe('requireTripAccess against a real database', () => {
  it('allows the owner', async () => {
    signInAs(ownerId, ownerEmail);
    await expect(requireTripAccess(tripId)).resolves.toMatchObject({
      id: tripId,
    });
  });

  it('allows an accepted collaborator', async () => {
    await db.tripCollaborator.create({
      data: { tripId, email: collaboratorEmail, status: 'ACCEPTED' },
    });
    signInAs(collaboratorId, collaboratorEmail);
    await expect(requireTripAccess(tripId)).resolves.toMatchObject({
      id: tripId,
    });
  });

  it('rejects a pending (not yet accepted) collaborator', async () => {
    await db.tripCollaborator.create({
      data: { tripId, email: collaboratorEmail, status: 'PENDING' },
    });
    signInAs(collaboratorId, collaboratorEmail);
    await expect(requireTripAccess(tripId)).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });

  it('rejects a user with no relation to the trip', async () => {
    signInAs(collaboratorId, collaboratorEmail);
    await expect(requireTripAccess(tripId)).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});

describe('requireTripOwner against a real database', () => {
  it('allows the owner', async () => {
    signInAs(ownerId, ownerEmail);
    await expect(requireTripOwner(tripId)).resolves.toMatchObject({
      id: tripId,
    });
  });

  it('rejects an accepted collaborator', async () => {
    await db.tripCollaborator.create({
      data: { tripId, email: collaboratorEmail, status: 'ACCEPTED' },
    });
    signInAs(collaboratorId, collaboratorEmail);
    await expect(requireTripOwner(tripId)).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});
```

- [ ] **Step 2: Run against the real database, verify pass**

```bash
docker compose up -d db
npx vitest run src/server/auth-scope.db.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/auth-scope.db.test.ts
git commit -m "test: cover requireTripAccess/requireTripOwner against real Postgres"
```

---

## Task 4: Rewire existing modules onto `requireTripAccess`/`requireTripOwner`

**Files:**
- Modify: `src/server/trips.ts`, `src/server/trips.test.ts`
- Modify: `src/server/expenses.ts`, `src/server/expenses.test.ts`
- Modify: `src/server/itinerary.ts`, `src/server/itinerary.test.ts`
- Modify: `src/server/budget.ts`, `src/server/budget.test.ts`
- Modify: `src/app/trips/[id]/page.tsx`
- Modify: `src/app/trips/[id]/edit/page.tsx`
- Modify: `src/server/trips.db.test.ts` (comment only)

Everywhere `requireTrip` currently means "the caller may read and write this trip's data" the correct replacement is `requireTripAccess` (owner or accepted collaborator, per the design's "co-editors get full edit rights on itinerary/budget/trip details" decision) — **except** `deleteTrip`, which stays owner-only.

- [ ] **Step 1: `src/server/expenses.ts` — plain rename**

Change line 5 and lines 22, 27, 41 (every `requireTrip` → `requireTripAccess`):

```ts
import { ForbiddenOrNotFoundError, requireTripAccess } from './auth-scope';
```

...and each call site (`const trip = await requireTrip(tripId);` → `const trip = await requireTripAccess(tripId);`) in `listExpenses`, `createExpense`, `deleteExpense`.

- [ ] **Step 2: `src/server/expenses.test.ts` — plain rename**

Replace every occurrence of the identifier `requireTrip` with `requireTripAccess` in this file (the import, the `vi.mock('./auth-scope', ...)` factory's `requireTrip: vi.fn()` → `requireTripAccess: vi.fn()`, and every `vi.mocked(requireTrip)`). No other changes — behavior is identical, only the name changes.

- [ ] **Step 3: `src/server/itinerary.ts` — plain rename**

Change line 6 and lines 10, 17, 46 the same way: `requireTrip` → `requireTripAccess` (import + every call in `requireDay`, `requireActivity`, `ensureDaysForTrip`).

- [ ] **Step 4: `src/server/itinerary.test.ts` — plain rename**

Same mechanical rename as Step 2: the import (line 4), the `vi.mock('./auth-scope', ...)` factory (line 23: `return { requireTrip: vi.fn(), ForbiddenOrNotFoundError };` → `return { requireTripAccess: vi.fn(), ForbiddenOrNotFoundError };`), and every `vi.mocked(requireTrip)` in the file.

- [ ] **Step 5: `src/server/budget.ts` — extract `summarizeBudget` + rename**

Replace the full contents of `src/server/budget.ts` with:

```ts
'use server';

import { convertMinor } from '../lib/fx';
import { db } from '../lib/db';
import { requireTripAccess } from './auth-scope';

export interface UnconvertedItem {
  id: string;
  label: string;
  category: string;
  originalMinor: number;
  originalCurrency: string;
}

export interface BudgetSummary {
  budgetMinor: number;
  baseCurrency: string;
  spentMinor: number;
  remainingMinor: number;
  isOverBudget: boolean;
  byCategory: Record<string, number>;
  byDay: Record<string, number>;
  unconvertedItems: UnconvertedItem[];
}

interface BudgetTrip {
  id: string;
  budgetMinor: number;
  baseCurrency: string;
}

// Extracted from getBudgetSummary so the public share-link path (sharing.ts,
// token-gated instead of session-gated) can reuse the same roll-up math
// without going through requireTripAccess.
export async function summarizeBudget(trip: BudgetTrip): Promise<BudgetSummary> {
  const [activities, expenses] = await Promise.all([
    db.activity.findMany({
      where: { day: { tripId: trip.id }, costMinor: { not: null } },
      include: { day: true },
    }),
    db.expense.findMany({ where: { tripId: trip.id } }),
  ]);

  const byCategory: Record<string, number> = {};
  const byDay: Record<string, number> = {};
  const unconvertedItems: UnconvertedItem[] = [];
  let spentMinor = 0;

  for (const activity of activities) {
    if (activity.costMinor == null || !activity.costCurrency) continue;
    const convertedMinor = await convertMinor(
      activity.costMinor,
      activity.costCurrency,
      trip.baseCurrency,
    );
    if (convertedMinor == null) {
      unconvertedItems.push({
        id: activity.id,
        label: activity.title,
        category: activity.category,
        originalMinor: activity.costMinor,
        originalCurrency: activity.costCurrency,
      });
      continue;
    }
    spentMinor += convertedMinor;
    byCategory[activity.category] =
      (byCategory[activity.category] ?? 0) + convertedMinor;
    const date = activity.day.date.toISOString().slice(0, 10);
    byDay[date] = (byDay[date] ?? 0) + convertedMinor;
  }

  for (const expense of expenses) {
    const convertedMinor = await convertMinor(
      expense.costMinor,
      expense.costCurrency,
      trip.baseCurrency,
    );
    if (convertedMinor == null) {
      unconvertedItems.push({
        id: expense.id,
        label: expense.label,
        category: expense.category,
        originalMinor: expense.costMinor,
        originalCurrency: expense.costCurrency,
      });
      continue;
    }
    spentMinor += convertedMinor;
    byCategory[expense.category] =
      (byCategory[expense.category] ?? 0) + convertedMinor;
  }

  return {
    budgetMinor: trip.budgetMinor,
    baseCurrency: trip.baseCurrency,
    spentMinor,
    remainingMinor: trip.budgetMinor - spentMinor,
    isOverBudget: spentMinor > trip.budgetMinor,
    byCategory,
    byDay,
    unconvertedItems,
  };
}

export async function getBudgetSummary(tripId: string): Promise<BudgetSummary> {
  const trip = await requireTripAccess(tripId);
  return summarizeBudget(trip);
}
```

- [ ] **Step 6: `src/server/budget.test.ts` — plain rename**

Rename every occurrence of `requireTrip` to `requireTripAccess` (import, `vi.mock('./auth-scope', () => ({ requireTrip: vi.fn() }))` → `requireTripAccess: vi.fn()`, and `vi.mocked(requireTrip)`). The tests still call `getBudgetSummary(...)` and assert the same output shape — `summarizeBudget` is an internal extraction, not a public API change, so no other test changes are needed.

- [ ] **Step 7: `src/server/trips.ts` — split rename**

Change line 12:

```ts
import { currentUserId, requireTripAccess, requireTripOwner } from './auth-scope';
```

Change `updateTrip` (was line 64) to use `requireTripAccess` (collaborators can edit trip details):

```ts
export async function updateTrip(tripId: string, input: TripUpdateInput) {
  const trip = await requireTripAccess(tripId);
```

Change `deleteTrip` (was line 81) to use `requireTripOwner` (owner-only per the design):

```ts
export async function deleteTrip(tripId: string) {
  const trip = await requireTripOwner(tripId);
  await db.trip.delete({ where: { id: trip.id } });
}
```

- [ ] **Step 8: `src/server/trips.test.ts` — split rename**

Change line 3 and the mock factory (lines 7-10):

```ts
import { currentUserId, requireTripAccess, requireTripOwner } from './auth-scope';
...
vi.mock('./auth-scope', () => ({
  currentUserId: vi.fn(),
  requireTripAccess: vi.fn(),
  requireTripOwner: vi.fn(),
}));
```

Add both to the `beforeEach` reset block (lines 22-28):

```ts
beforeEach(() => {
  vi.mocked(currentUserId).mockReset();
  vi.mocked(requireTripAccess).mockReset();
  vi.mocked(requireTripOwner).mockReset();
  vi.mocked(db.trip.findMany).mockReset();
  vi.mocked(db.trip.create).mockReset();
  vi.mocked(db.trip.updateMany).mockReset();
  vi.mocked(db.trip.delete).mockReset();
});
```

In the `describe('updateTrip', ...)` block, rename `vi.mocked(requireTrip)` to `vi.mocked(requireTripAccess)` in all three tests (was lines 110, 132, 144) — no other changes.

In the `describe('deleteTrip', ...)` block, change the mock and assertion to use `requireTripOwner`:

```ts
describe('deleteTrip', () => {
  it('deletes the trip after authorization', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue({
      id: 'trip-1',
      userId: 'user-1',
    } as never);
    vi.mocked(db.trip.delete).mockResolvedValue({} as never);

    await deleteTrip('trip-1');

    expect(requireTripOwner).toHaveBeenCalledWith('trip-1');
    expect(db.trip.delete).toHaveBeenCalledWith({ where: { id: 'trip-1' } });
  });
});
```

- [ ] **Step 9: `src/app/trips/[id]/page.tsx` — plain rename**

Change line 9 and line 24: `requireTrip` → `requireTripAccess`.

- [ ] **Step 10: `src/app/trips/[id]/edit/page.tsx` — rename + gate the delete button**

Change line 8:

```ts
import { ForbiddenOrNotFoundError, requireTripAccess } from '@/server/auth-scope';
```

Change line 25: `trip = await requireTripAccess(id);`

Add `import { currentUserId } from '@/server/auth-scope';` is unnecessary — instead add ownership check right after the `try`/`catch` block (after line 35's closing `}`), before the `boundUpdate`/`boundDelete` lines:

```ts
  const { currentUserId } = await import('@/server/auth-scope');
```

Actually, add it as a normal top-of-file import instead of a dynamic one — change line 8 to:

```ts
import {
  currentUserId,
  ForbiddenOrNotFoundError,
  requireTripAccess,
} from '@/server/auth-scope';
```

Then after the `try`/`catch` block (after the closing `}` that was line 35), add:

```ts
  const isOwner = trip.userId === (await currentUserId());
```

Finally, wrap the delete form (was lines 64-71) so it only renders for the owner — collaborators can reach this page (they can edit trip details) but only the owner can delete the trip, matching `requireTripOwner` server-side in Task 4 Step 7:

```tsx
        {isOwner && (
          <form action={boundDelete} className="mt-8">
            <button
              type="submit"
              className="text-sm text-red-600 dark:text-red-400 underline"
            >
              Delete trip
            </button>
          </form>
        )}
```

- [ ] **Step 11: `src/server/trips.db.test.ts` — update the comment**

Change the comment on line 10 from `// currentUserId/requireTrip run for real against the real db.` to `// currentUserId/requireTripAccess/requireTripOwner run for real against the real db.` — no code changes.

- [ ] **Step 12: Run the full suite, verify everything is still green**

```bash
npx tsc --noEmit
npm run lint
docker compose up -d db
npm run test
```

Expected: no type errors, no lint errors, all tests PASS (mocked + `.db.test.ts`).

- [ ] **Step 13: Commit**

```bash
git add src/server src/app/trips
git commit -m "refactor: rewire existing trip/itinerary/budget/expense code onto requireTripAccess/requireTripOwner"
```

---

## Task 5: `errors.ts` — `InvalidShareLinkError`

**Files:**
- Modify: `src/server/errors.ts`

- [ ] **Step 1: Add the error class**

Add to `src/server/errors.ts`:

```ts
export class InvalidShareLinkError extends Error {
  constructor() {
    super('This link is no longer valid.');
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/server/errors.ts
git commit -m "feat: add InvalidShareLinkError"
```

---

## Task 6: `sharing.ts` — share-link management (TDD)

**Files:**
- Create: `src/server/sharing.ts`
- Create: `src/server/sharing.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../lib/db';
import { requireTripOwner } from './auth-scope';
import { enableShareLink, getShareStatus, revokeShareLink } from './sharing';

vi.mock('./auth-scope', () => {
  class ForbiddenOrNotFoundError extends Error {
    constructor() {
      super("That trip doesn't exist or you don't have access.");
    }
  }
  return {
    requireTripOwner: vi.fn(),
    currentUserEmail: vi.fn(),
    ForbiddenOrNotFoundError,
  };
});
vi.mock('../lib/db', () => ({
  db: {
    trip: { update: vi.fn() },
    tripCollaborator: { findMany: vi.fn() },
  },
}));

const trip = { id: 'trip-1', userId: 'user-1', shareToken: null };

beforeEach(() => {
  vi.mocked(requireTripOwner).mockReset();
  vi.mocked(db.trip.update).mockReset();
  vi.mocked(db.tripCollaborator.findMany).mockReset();
});

describe('getShareStatus', () => {
  it('returns the share token and collaborators after owner authorization', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue({
      ...trip,
      shareToken: 'abc123',
    } as never);
    vi.mocked(db.tripCollaborator.findMany).mockResolvedValue([
      { id: 'c1', email: 'friend@example.com', status: 'ACCEPTED' },
    ] as never);

    const status = await getShareStatus('trip-1');

    expect(status).toEqual({
      shareToken: 'abc123',
      collaborators: [
        { id: 'c1', email: 'friend@example.com', status: 'ACCEPTED' },
      ],
    });
    expect(db.tripCollaborator.findMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1' },
      orderBy: { createdAt: 'asc' },
    });
  });
});

describe('enableShareLink', () => {
  it('generates and sets a new share token', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);
    vi.mocked(db.trip.update).mockResolvedValue({} as never);

    const token = await enableShareLink('trip-1');

    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(10);
    expect(db.trip.update).toHaveBeenCalledWith({
      where: { id: 'trip-1' },
      data: { shareToken: token },
    });
  });

  it('generates a fresh token even when one already exists (regenerate)', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue({
      ...trip,
      shareToken: 'old-token',
    } as never);
    vi.mocked(db.trip.update).mockResolvedValue({} as never);

    const token = await enableShareLink('trip-1');

    expect(token).not.toBe('old-token');
  });
});

describe('revokeShareLink', () => {
  it('clears the share token', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue({
      ...trip,
      shareToken: 'abc123',
    } as never);
    vi.mocked(db.trip.update).mockResolvedValue({} as never);

    await revokeShareLink('trip-1');

    expect(db.trip.update).toHaveBeenCalledWith({
      where: { id: 'trip-1' },
      data: { shareToken: null },
    });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/server/sharing.test.ts`
Expected: FAIL — `src/server/sharing.ts` does not exist.

- [ ] **Step 3: Implement**

Create `src/server/sharing.ts`:

```ts
'use server';

/**
 * Trip sharing: a public read-only link (Trip.shareToken) and named
 * co-editors (TripCollaborator, invited by email, explicitly accepted or
 * declined — no separate accept/decline table, just a status column).
 * @packageDocumentation
 */

import { randomBytes } from 'node:crypto';
import { db } from '../lib/db';
import { requireTripOwner } from './auth-scope';

export interface CollaboratorSummary {
  id: string;
  email: string;
  status: string;
}

export interface ShareStatus {
  shareToken: string | null;
  collaborators: CollaboratorSummary[];
}

export async function getShareStatus(tripId: string): Promise<ShareStatus> {
  const trip = await requireTripOwner(tripId);
  const collaborators = await db.tripCollaborator.findMany({
    where: { tripId: trip.id },
    orderBy: { createdAt: 'asc' },
  });
  return {
    shareToken: trip.shareToken,
    collaborators: collaborators.map((c) => ({
      id: c.id,
      email: c.email,
      status: c.status,
    })),
  };
}

export async function enableShareLink(tripId: string): Promise<string> {
  const trip = await requireTripOwner(tripId);
  const shareToken = randomBytes(24).toString('base64url');
  await db.trip.update({ where: { id: trip.id }, data: { shareToken } });
  return shareToken;
}

export async function revokeShareLink(tripId: string): Promise<void> {
  const trip = await requireTripOwner(tripId);
  await db.trip.update({
    where: { id: trip.id },
    data: { shareToken: null },
  });
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/server/sharing.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/sharing.ts src/server/sharing.test.ts
git commit -m "feat: share-link management (getShareStatus, enableShareLink, revokeShareLink)"
```

---

## Task 7: `sharing.ts` — collaborator invite/accept/decline (TDD)

**Files:**
- Modify: `src/server/sharing.ts`
- Modify: `src/server/sharing.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/server/sharing.test.ts` (extend the existing `vi.mock('./auth-scope', ...)` factory to also export `currentUserEmail` — it already does from Task 6's setup — and extend the `vi.mock('../lib/db', ...)` factory's `tripCollaborator` object to add `findUnique`, `create`, `delete`, `update`, `findFirst`):

```ts
vi.mock('../lib/db', () => ({
  db: {
    trip: { update: vi.fn() },
    tripCollaborator: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
```

(Replace the Task 6 `vi.mock('../lib/db', ...)` block with the above — same shape, more methods.)

Then append:

```ts
import {
  acceptInvite,
  declineInvite,
  inviteCollaborator,
  listPendingInvites,
  removeCollaborator,
} from './sharing';
import { currentUserEmail, ForbiddenOrNotFoundError } from './auth-scope';
import { ValidationError } from './errors';

describe('inviteCollaborator', () => {
  it('creates a PENDING collaborator row after owner authorization', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);
    vi.mocked(db.tripCollaborator.findUnique).mockResolvedValue(null);
    vi.mocked(db.tripCollaborator.create).mockResolvedValue({} as never);

    await inviteCollaborator('trip-1', 'friend@example.com');

    expect(db.tripCollaborator.create).toHaveBeenCalledWith({
      data: { tripId: 'trip-1', email: 'friend@example.com', status: 'PENDING' },
    });
  });

  it('rejects an email that is already invited or already a collaborator', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);
    vi.mocked(db.tripCollaborator.findUnique).mockResolvedValue({
      id: 'c1',
    } as never);

    await expect(
      inviteCollaborator('trip-1', 'friend@example.com'),
    ).rejects.toThrow(ValidationError);
    expect(db.tripCollaborator.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid email', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);

    await expect(inviteCollaborator('trip-1', 'not-an-email')).rejects.toThrow(
      ValidationError,
    );
    expect(db.tripCollaborator.create).not.toHaveBeenCalled();
  });
});

describe('removeCollaborator', () => {
  it('deletes the collaborator row after owner authorization', async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);
    vi.mocked(db.tripCollaborator.findFirst).mockResolvedValue({
      id: 'c1',
      tripId: 'trip-1',
    } as never);
    vi.mocked(db.tripCollaborator.delete).mockResolvedValue({} as never);

    await removeCollaborator('trip-1', 'c1');

    expect(db.tripCollaborator.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });

  it("throws ForbiddenOrNotFoundError when the collaborator isn't scoped to the trip", async () => {
    vi.mocked(requireTripOwner).mockResolvedValue(trip as never);
    vi.mocked(db.tripCollaborator.findFirst).mockResolvedValue(null);

    await expect(removeCollaborator('trip-1', 'c1')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});

describe('listPendingInvites', () => {
  it("lists the current user's pending invites with trip names", async () => {
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.tripCollaborator.findMany).mockResolvedValue([
      { trip: { id: 'trip-1', name: 'Japan Trip' } },
    ] as never);

    const invites = await listPendingInvites();

    expect(invites).toEqual([{ tripId: 'trip-1', tripName: 'Japan Trip' }]);
    expect(db.tripCollaborator.findMany).toHaveBeenCalledWith({
      where: { email: 'me@example.com', status: 'PENDING' },
      include: { trip: { select: { id: true, name: true } } },
    });
  });
});

describe('acceptInvite', () => {
  it('flips a matching pending invite to ACCEPTED', async () => {
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.tripCollaborator.findFirst).mockResolvedValue({
      id: 'c1',
    } as never);
    vi.mocked(db.tripCollaborator.update).mockResolvedValue({} as never);

    await acceptInvite('trip-1');

    expect(db.tripCollaborator.findFirst).toHaveBeenCalledWith({
      where: { tripId: 'trip-1', email: 'me@example.com', status: 'PENDING' },
    });
    expect(db.tripCollaborator.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { status: 'ACCEPTED' },
    });
  });

  it('throws ForbiddenOrNotFoundError when there is no matching pending invite', async () => {
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.tripCollaborator.findFirst).mockResolvedValue(null);

    await expect(acceptInvite('trip-1')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});

describe('declineInvite', () => {
  it('deletes a matching pending invite', async () => {
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.tripCollaborator.findFirst).mockResolvedValue({
      id: 'c1',
    } as never);
    vi.mocked(db.tripCollaborator.delete).mockResolvedValue({} as never);

    await declineInvite('trip-1');

    expect(db.tripCollaborator.delete).toHaveBeenCalledWith({
      where: { id: 'c1' },
    });
  });

  it('throws ForbiddenOrNotFoundError when there is no matching pending invite', async () => {
    vi.mocked(currentUserEmail).mockResolvedValue('me@example.com');
    vi.mocked(db.tripCollaborator.findFirst).mockResolvedValue(null);

    await expect(declineInvite('trip-1')).rejects.toBeInstanceOf(
      ForbiddenOrNotFoundError,
    );
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/server/sharing.test.ts`
Expected: FAIL — the new exports don't exist yet.

- [ ] **Step 3: Implement**

In `src/server/sharing.ts`, replace the existing `import { requireTripOwner } from './auth-scope';` line with:

```ts
import { currentUserEmail, ForbiddenOrNotFoundError, requireTripOwner } from './auth-scope';
```

And add a new import line below it:

```ts
import { ValidationError } from './errors';
```

Then, after the existing `revokeShareLink` function, append:

```ts
function validateEmail(email: string) {
  if (!email.includes('@')) {
    throw new ValidationError('Enter a valid email address.');
  }
}

export async function inviteCollaborator(
  tripId: string,
  email: string,
): Promise<void> {
  const trip = await requireTripOwner(tripId);
  validateEmail(email);
  const existing = await db.tripCollaborator.findUnique({
    where: { tripId_email: { tripId: trip.id, email } },
  });
  if (existing) {
    throw new ValidationError(
      'This person is already invited or already a collaborator.',
    );
  }
  await db.tripCollaborator.create({
    data: { tripId: trip.id, email, status: 'PENDING' },
  });
}

export async function removeCollaborator(
  tripId: string,
  collaboratorId: string,
): Promise<void> {
  const trip = await requireTripOwner(tripId);
  const collaborator = await db.tripCollaborator.findFirst({
    where: { id: collaboratorId, tripId: trip.id },
  });
  if (!collaborator) throw new ForbiddenOrNotFoundError();
  await db.tripCollaborator.delete({ where: { id: collaborator.id } });
}

export interface PendingInvite {
  tripId: string;
  tripName: string;
}

export async function listPendingInvites(): Promise<PendingInvite[]> {
  const email = await currentUserEmail();
  const invites = await db.tripCollaborator.findMany({
    where: { email, status: 'PENDING' },
    include: { trip: { select: { id: true, name: true } } },
  });
  return invites.map((invite) => ({
    tripId: invite.trip.id,
    tripName: invite.trip.name,
  }));
}

async function requireOwnPendingInvite(tripId: string) {
  const email = await currentUserEmail();
  const invite = await db.tripCollaborator.findFirst({
    where: { tripId, email, status: 'PENDING' },
  });
  if (!invite) throw new ForbiddenOrNotFoundError();
  return invite;
}

export async function acceptInvite(tripId: string): Promise<void> {
  const invite = await requireOwnPendingInvite(tripId);
  await db.tripCollaborator.update({
    where: { id: invite.id },
    data: { status: 'ACCEPTED' },
  });
}

export async function declineInvite(tripId: string): Promise<void> {
  const invite = await requireOwnPendingInvite(tripId);
  await db.tripCollaborator.delete({ where: { id: invite.id } });
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/server/sharing.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/sharing.ts src/server/sharing.test.ts
git commit -m "feat: collaborator invite/accept/decline/remove"
```

---

## Task 8: `sharing.ts` — public (token-gated) read path (TDD)

**Files:**
- Modify: `src/server/sharing.ts`
- Modify: `src/server/sharing.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to the `vi.mock('../lib/db', ...)` factory in `src/server/sharing.test.ts`: add `trip: { update: vi.fn(), findUnique: vi.fn() }` and `day: { findMany: vi.fn() }` and `expense: { findMany: vi.fn() }`, and mock `./budget`:

```ts
vi.mock('../lib/db', () => ({
  db: {
    trip: { update: vi.fn(), findUnique: vi.fn() },
    day: { findMany: vi.fn() },
    expense: { findMany: vi.fn() },
    tripCollaborator: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));
vi.mock('./budget', () => ({ summarizeBudget: vi.fn() }));
```

(Replace the Task 7 `vi.mock('../lib/db', ...)` block with the above.)

Append:

```ts
import { getSharedBudgetSummary, getSharedTrip, listSharedExpenses } from './sharing';
import { InvalidShareLinkError } from './errors';
import { summarizeBudget } from './budget';

const sharedTrip = {
  id: 'trip-1',
  name: 'Japan Trip',
  budgetMinor: 350000,
  baseCurrency: 'JPY',
  shareToken: 'abc123',
};

describe('getSharedTrip', () => {
  it('returns the trip and its days/activities for a valid token', async () => {
    vi.mocked(db.trip.findUnique).mockResolvedValue(sharedTrip as never);
    vi.mocked(db.day.findMany).mockResolvedValue([] as never);

    const result = await getSharedTrip('abc123');

    expect(result.trip).toBe(sharedTrip);
    expect(db.day.findMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1' },
      orderBy: { date: 'asc' },
      include: { activities: { orderBy: { sortOrder: 'asc' } } },
    });
  });

  it('throws InvalidShareLinkError for an unknown token', async () => {
    vi.mocked(db.trip.findUnique).mockResolvedValue(null);

    await expect(getSharedTrip('bad-token')).rejects.toBeInstanceOf(
      InvalidShareLinkError,
    );
  });
});

describe('getSharedBudgetSummary', () => {
  it('delegates to summarizeBudget for a valid token', async () => {
    vi.mocked(db.trip.findUnique).mockResolvedValue(sharedTrip as never);
    vi.mocked(summarizeBudget).mockResolvedValue({
      budgetMinor: 350000,
    } as never);

    const summary = await getSharedBudgetSummary('abc123');

    expect(summarizeBudget).toHaveBeenCalledWith(sharedTrip);
    expect(summary).toEqual({ budgetMinor: 350000 });
  });

  it('throws InvalidShareLinkError for an unknown token', async () => {
    vi.mocked(db.trip.findUnique).mockResolvedValue(null);

    await expect(getSharedBudgetSummary('bad-token')).rejects.toBeInstanceOf(
      InvalidShareLinkError,
    );
  });
});

describe('listSharedExpenses', () => {
  it('returns the expenses for a valid token', async () => {
    vi.mocked(db.trip.findUnique).mockResolvedValue(sharedTrip as never);
    vi.mocked(db.expense.findMany).mockResolvedValue([{ id: 'e1' }] as never);

    const expenses = await listSharedExpenses('abc123');

    expect(expenses).toEqual([{ id: 'e1' }]);
    expect(db.expense.findMany).toHaveBeenCalledWith({
      where: { tripId: 'trip-1' },
    });
  });
});
```

- [ ] **Step 2: Run tests, verify they fail**

Run: `npx vitest run src/server/sharing.test.ts`
Expected: FAIL — `getSharedTrip`, `getSharedBudgetSummary`, `listSharedExpenses` don't exist.

- [ ] **Step 3: Implement**

Add to the top-of-file imports in `src/server/sharing.ts`:

```ts
import { summarizeBudget } from './budget';
import { InvalidShareLinkError } from './errors';
```

Append to `src/server/sharing.ts`:

```ts
async function requireShareToken(token: string) {
  const trip = await db.trip.findUnique({ where: { shareToken: token } });
  if (!trip) throw new InvalidShareLinkError();
  return trip;
}

export async function getSharedTrip(token: string) {
  const trip = await requireShareToken(token);
  const days = await db.day.findMany({
    where: { tripId: trip.id },
    orderBy: { date: 'asc' },
    include: { activities: { orderBy: { sortOrder: 'asc' } } },
  });
  return { trip, days };
}

export async function getSharedBudgetSummary(token: string) {
  const trip = await requireShareToken(token);
  return summarizeBudget(trip);
}

export async function listSharedExpenses(token: string) {
  const trip = await requireShareToken(token);
  return db.expense.findMany({ where: { tripId: trip.id } });
}
```

- [ ] **Step 4: Run tests, verify they pass**

Run: `npx vitest run src/server/sharing.test.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/server/sharing.ts src/server/sharing.test.ts
git commit -m "feat: public token-gated trip/budget/expense reads for the share link"
```

---

## Task 9: `sharing.db.test.ts` — real-Postgres integration

**Files:**
- Create: `src/server/sharing.db.test.ts`

- [ ] **Step 1: Write the test**

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { auth } from '../auth';
import { db } from '../lib/db';
import { InvalidShareLinkError } from './errors';
import {
  acceptInvite,
  declineInvite,
  enableShareLink,
  getSharedTrip,
  inviteCollaborator,
  listPendingInvites,
  removeCollaborator,
  revokeShareLink,
} from './sharing';

vi.mock('../auth', () => ({ auth: vi.fn() }));

let ownerId: string;
let ownerEmail: string;
let tripId: string;
const inviteeEmail = `invitee-${crypto.randomUUID()}@example.com`;

function signInAsOwner() {
  vi.mocked(auth).mockResolvedValue({
    user: { id: ownerId, email: ownerEmail },
  } as never);
}

function signInAsInvitee() {
  vi.mocked(auth).mockResolvedValue({
    user: { id: 'invitee-id', email: inviteeEmail },
  } as never);
}

beforeEach(async () => {
  ownerEmail = `owner-${crypto.randomUUID()}@example.com`;
  const owner = await db.user.create({ data: { email: ownerEmail } });
  ownerId = owner.id;

  const trip = await db.trip.create({
    data: {
      userId: ownerId,
      name: 'Shared Trip',
      destinations: ['Tokyo'],
      startDate: new Date('2026-09-01'),
      endDate: new Date('2026-09-05'),
      baseCurrency: 'JPY',
      budgetMinor: 100000,
    },
  });
  tripId = trip.id;
});

afterEach(async () => {
  await db.tripCollaborator.deleteMany({ where: { tripId } });
  await db.trip.deleteMany({ where: { id: tripId } });
  await db.user.delete({ where: { id: ownerId } });
});

describe('share link against a real database', () => {
  it('enables, retrieves, and revokes a link end to end', async () => {
    signInAsOwner();
    const token = await enableShareLink(tripId);

    const { trip } = await getSharedTrip(token);
    expect(trip.id).toBe(tripId);

    signInAsOwner();
    await revokeShareLink(tripId);

    await expect(getSharedTrip(token)).rejects.toBeInstanceOf(
      InvalidShareLinkError,
    );
  });

  it('regenerating invalidates the previous token', async () => {
    signInAsOwner();
    const firstToken = await enableShareLink(tripId);
    signInAsOwner();
    const secondToken = await enableShareLink(tripId);

    expect(secondToken).not.toBe(firstToken);
    await expect(getSharedTrip(firstToken)).rejects.toBeInstanceOf(
      InvalidShareLinkError,
    );
    await expect(getSharedTrip(secondToken)).resolves.toMatchObject({
      trip: { id: tripId },
    });
  });
});

describe('collaborator invite flow against a real database', () => {
  it('invite -> accept makes the invitee a collaborator visible to the owner', async () => {
    signInAsOwner();
    await inviteCollaborator(tripId, inviteeEmail);

    signInAsInvitee();
    const pending = await listPendingInvites();
    expect(pending).toEqual([{ tripId, tripName: 'Shared Trip' }]);

    signInAsInvitee();
    await acceptInvite(tripId);

    const collaborators = await db.tripCollaborator.findMany({
      where: { tripId },
    });
    expect(collaborators).toHaveLength(1);
    expect(collaborators[0].status).toBe('ACCEPTED');
  });

  it('declining removes the invite entirely', async () => {
    signInAsOwner();
    await inviteCollaborator(tripId, inviteeEmail);

    signInAsInvitee();
    await declineInvite(tripId);

    const collaborators = await db.tripCollaborator.findMany({
      where: { tripId },
    });
    expect(collaborators).toHaveLength(0);
  });

  it('the owner can remove an accepted collaborator', async () => {
    signInAsOwner();
    await inviteCollaborator(tripId, inviteeEmail);
    signInAsInvitee();
    await acceptInvite(tripId);

    const collaborator = await db.tripCollaborator.findFirstOrThrow({
      where: { tripId },
    });
    signInAsOwner();
    await removeCollaborator(tripId, collaborator.id);

    const remaining = await db.tripCollaborator.findMany({ where: { tripId } });
    expect(remaining).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run against the real database, verify pass**

```bash
docker compose up -d db
npx vitest run src/server/sharing.db.test.ts
```

Expected: all PASS.

- [ ] **Step 3: Commit**

```bash
git add src/server/sharing.db.test.ts
git commit -m "test: cover the sharing flows end to end against real Postgres"
```

---

## Task 10: Server Actions — owner sharing controls

**Files:**
- Create: `src/app/trips/[id]/sharing-actions.ts`

- [ ] **Step 1: Implement**

```ts
'use server';

import { revalidatePath } from 'next/cache';
import {
  enableShareLink,
  inviteCollaborator,
  removeCollaborator,
  revokeShareLink,
} from '@/server/sharing';
import { ValidationError } from '@/server/errors';

export interface InviteFormState {
  error?: string;
}

export async function enableShareLinkAction(tripId: string): Promise<void> {
  await enableShareLink(tripId);
  revalidatePath(`/trips/${tripId}`);
}

export async function revokeShareLinkAction(tripId: string): Promise<void> {
  await revokeShareLink(tripId);
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
  await removeCollaborator(tripId, collaboratorId);
  revalidatePath(`/trips/${tripId}`);
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/trips/[id]/sharing-actions.ts
git commit -m "feat: server actions for owner sharing controls"
```

---

## Task 11: Server Actions — accept/decline invite

**Files:**
- Modify: `src/app/trips/actions.ts`

- [ ] **Step 1: Add the actions**

Add to `src/app/trips/actions.ts` (new imports at the top, alongside the existing `createTrip, deleteTrip, updateTrip` import line):

```ts
import { acceptInvite, declineInvite } from '@/server/sharing';
```

Append to the end of the file:

```ts
export async function acceptInviteAction(tripId: string): Promise<void> {
  await acceptInvite(tripId);
  revalidatePath('/trips');
}

export async function declineInviteAction(tripId: string): Promise<void> {
  await declineInvite(tripId);
  revalidatePath('/trips');
}
```

This also requires adding `revalidatePath` to the `next/cache` import — change the top of the file to:

```ts
'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createTrip, deleteTrip, updateTrip } from '@/server/trips';
import { acceptInvite, declineInvite } from '@/server/sharing';
import { StaleWriteError, ValidationError } from '@/server/errors';
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/trips/actions.ts
git commit -m "feat: server actions for accepting/declining a collaborator invite"
```

---

## Task 12: UI — `SharingPanel` on the trip page (owner-only)

**Files:**
- Create: `src/app/trips/[id]/SharingPanel.tsx`
- Modify: `src/app/trips/[id]/page.tsx`

- [ ] **Step 1: Implement the panel**

```tsx
// src/app/trips/[id]/SharingPanel.tsx
'use client';

import { useActionState } from 'react';
import type { InviteFormState } from './sharing-actions';
import {
  enableShareLinkAction,
  inviteCollaboratorAction,
  removeCollaboratorAction,
  revokeShareLinkAction,
} from './sharing-actions';
import type { ShareStatus } from '@/server/sharing';

export function SharingPanel({
  tripId,
  status,
}: {
  tripId: string;
  status: ShareStatus;
}) {
  const [state, formAction, isPending] = useActionState<
    InviteFormState,
    FormData
  >(inviteCollaboratorAction.bind(null, tripId), {});

  const shareUrl =
    status.shareToken && typeof window !== 'undefined'
      ? `${window.location.origin}/shared/${status.shareToken}`
      : null;

  return (
    <section className="mb-10 rounded-lg border border-black/[.08] p-5 dark:border-white/[.145]">
      <h2 className="font-medium text-black dark:text-zinc-50 mb-4">
        Sharing
      </h2>

      <div className="mb-6">
        {status.shareToken ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-zinc-600 dark:text-zinc-400 break-all">
              {shareUrl ?? `/shared/${status.shareToken}`}
            </p>
            <div className="flex gap-4">
              <form action={enableShareLinkAction.bind(null, tripId)}>
                <button
                  type="submit"
                  className="text-sm text-zinc-600 dark:text-zinc-400 underline"
                >
                  Regenerate link
                </button>
              </form>
              <form action={revokeShareLinkAction.bind(null, tripId)}>
                <button
                  type="submit"
                  className="text-sm text-red-600 dark:text-red-400 underline"
                >
                  Turn off link
                </button>
              </form>
            </div>
          </div>
        ) : (
          <form action={enableShareLinkAction.bind(null, tripId)}>
            <button
              type="submit"
              className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
            >
              Create public read-only link
            </button>
          </form>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-black dark:text-zinc-50 mb-2">
          Collaborators
        </h3>
        {status.collaborators.length > 0 && (
          <ul className="flex flex-col gap-2 mb-4">
            {status.collaborators.map((collaborator) => (
              <li
                key={collaborator.id}
                className="flex items-center justify-between text-sm"
              >
                <span>
                  {collaborator.email}{' '}
                  <span className="text-zinc-500 dark:text-zinc-400">
                    ({collaborator.status === 'ACCEPTED' ? 'accepted' : 'pending'})
                  </span>
                </span>
                <form
                  action={removeCollaboratorAction.bind(
                    null,
                    tripId,
                    collaborator.id,
                  )}
                >
                  <button
                    type="submit"
                    className="text-red-600 dark:text-red-400 underline"
                  >
                    Remove
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
        <form action={formAction} className="flex gap-2">
          {state.error && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {state.error}
            </p>
          )}
          <input
            type="email"
            name="email"
            required
            placeholder="friend@example.com"
            className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/[.145] dark:bg-transparent"
          />
          <button
            type="submit"
            disabled={isPending}
            className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
          >
            Invite
          </button>
        </form>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wire into the trip page, owner-only**

Modify `src/app/trips/[id]/page.tsx`. Change the imports at the top:

```tsx
import Link from 'next/link';
import { currentUserId, ForbiddenOrNotFoundError, requireTripAccess } from '@/server/auth-scope';
import { ensureDaysForTrip } from '@/server/itinerary';
import { getShareStatus } from '@/server/sharing';
import { BudgetPanel } from './BudgetPanel';
import { ItineraryDays } from './ItineraryDays';
import { SharingPanel } from './SharingPanel';
```

After `trip = await requireTripAccess(id); days = await ensureDaysForTrip(id);` inside the `try` block, add:

```tsx
    trip = await requireTripAccess(id);
    days = await ensureDaysForTrip(id);
    isOwner = trip.userId === (await currentUserId());
```

This requires declaring `isOwner` alongside the existing `let trip; let days;` at the top of the function:

```tsx
  let trip;
  let days;
  let isOwner = false;
```

Finally, render the panel owner-only, after the `<BudgetPanel tripId={trip.id} />` line:

```tsx
        <BudgetPanel tripId={trip.id} />

        {isOwner && <SharingPanel tripId={trip.id} status={await getShareStatus(trip.id)} />}

        <ItineraryDays tripId={trip.id} days={days} />
```

- [ ] **Step 3: Verify manually**

```bash
docker compose up -d db
npm run dev
```

Sign in, open a trip you own — the Sharing panel should appear with "Create public read-only link" and an invite form. Sign in as a different user with no relation to the trip and try to load `/trips/<id>` — should show the "doesn't exist or you don't have access" message, unaffected by this change.

- [ ] **Step 4: Commit**

```bash
git add "src/app/trips/[id]/SharingPanel.tsx" "src/app/trips/[id]/page.tsx"
git commit -m "feat: sharing panel UI on the trip page (owner-only)"
```

---

## Task 13: UI — pending invites on the dashboard

**Files:**
- Create: `src/app/trips/InvitesBanner.tsx`
- Modify: `src/app/trips/page.tsx`

- [ ] **Step 1: Implement the banner**

```tsx
// src/app/trips/InvitesBanner.tsx
import { acceptInviteAction, declineInviteAction } from './actions';
import type { PendingInvite } from '@/server/sharing';

export function InvitesBanner({ invites }: { invites: PendingInvite[] }) {
  if (invites.length === 0) return null;

  return (
    <ul className="flex flex-col gap-3 mb-8">
      {invites.map((invite) => (
        <li
          key={invite.tripId}
          className="flex items-center justify-between gap-4 rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
        >
          <p className="text-sm text-black dark:text-zinc-50">
            You&apos;ve been invited to collaborate on{' '}
            <span className="font-medium">{invite.tripName}</span>.
          </p>
          <div className="flex gap-3 shrink-0">
            <form action={acceptInviteAction.bind(null, invite.tripId)}>
              <button
                type="submit"
                className="rounded-full bg-foreground px-4 py-1.5 text-sm font-medium text-background hover:bg-[#383838] dark:hover:bg-[#ccc]"
              >
                Accept
              </button>
            </form>
            <form action={declineInviteAction.bind(null, invite.tripId)}>
              <button
                type="submit"
                className="text-sm text-zinc-600 dark:text-zinc-400 underline"
              >
                Decline
              </button>
            </form>
          </div>
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 2: Wire into the dashboard**

Modify `src/app/trips/page.tsx`. Change the imports:

```tsx
import Link from 'next/link';
import { formatMoney } from '@/lib/money';
import { listTrips } from '@/server/trips';
import { listPendingInvites } from '@/server/sharing';
import { InvitesBanner } from './InvitesBanner';
```

Change the `TripsPage` function body to fetch both in parallel and render the banner above the `<div className="flex items-center justify-between mb-8">` header block:

```tsx
export default async function TripsPage() {
  const [trips, invites] = await Promise.all([listTrips(), listPendingInvites()]);

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <main className="flex-1 w-full max-w-3xl mx-auto py-16 px-8">
        <InvitesBanner invites={invites} />

        <div className="flex items-center justify-between mb-8">
```

(The rest of the file is unchanged — it already closes out correctly below.)

- [ ] **Step 3: Verify manually**

As the owner, invite a second test account's email. Sign in as that account — the dashboard should show the invite card with Accept/Decline. Accepting should make the trip's data editable for that account (verify by opening the trip and adding an activity).

- [ ] **Step 4: Commit**

```bash
git add src/app/trips/InvitesBanner.tsx src/app/trips/page.tsx
git commit -m "feat: pending-invite banner on the trips dashboard"
```

---

## Task 14: Public share page

**Files:**
- Create: `src/app/shared/[token]/page.tsx`
- Create: `src/app/shared/[token]/SharedTripView.tsx`

- [ ] **Step 1: Verify the route is public**

`src/proxy.ts`'s `config.matcher` is `['/trips/:path*']` — `/shared/*` is not matched, so it's public by default. No changes needed there; this step is a sanity check the executing engineer should confirm by reading `src/proxy.ts` before continuing.

- [ ] **Step 2: Implement the read-only view component**

```tsx
// src/app/shared/[token]/SharedTripView.tsx
import { Map } from '@/components/Map';
import { formatMoney } from '@/lib/money';
import type { getSharedBudgetSummary, getSharedTrip } from '@/server/sharing';

type SharedTripData = Awaited<ReturnType<typeof getSharedTrip>>;
type BudgetSummary = Awaited<ReturnType<typeof getSharedBudgetSummary>>;

function formatDay(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  }).format(date);
}

export function SharedTripView({
  data,
  budget,
}: {
  data: SharedTripData;
  budget: BudgetSummary;
}) {
  const { trip, days } = data;

  const pins = days
    .flatMap((day) => day.activities)
    .filter((activity) => activity.lat != null && activity.lng != null)
    .map((activity) => ({
      id: activity.id,
      lat: activity.lat!,
      lng: activity.lng!,
      title: activity.title,
    }));

  return (
    <div className="flex flex-col flex-1 bg-zinc-50 dark:bg-black">
      <main className="flex-1 w-full max-w-3xl mx-auto py-16 px-8">
        <p className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400 mb-2">
          Read-only shared view
        </p>
        <h1 className="text-2xl font-semibold text-black dark:text-zinc-50 mb-8">
          {trip.name}
        </h1>

        <section className="mb-10 rounded-lg border border-black/[.08] p-5 dark:border-white/[.145]">
          <h2 className="font-medium text-black dark:text-zinc-50 mb-2">
            Budget
          </h2>
          <p className="text-zinc-700 dark:text-zinc-300">
            {formatMoney(budget.spentMinor, budget.baseCurrency)} of{' '}
            {formatMoney(budget.budgetMinor, budget.baseCurrency)} planned
          </p>
        </section>

        <div className="flex flex-col gap-8">
          <Map pins={pins} selectedId={null} onSelectPin={() => {}} />

          {days.map((day) => (
            <section key={day.id}>
              <h2 className="font-medium text-black dark:text-zinc-50 mb-3">
                {formatDay(day.date)}
              </h2>
              {day.activities.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {day.activities.map((activity) => (
                    <li
                      key={activity.id}
                      className="rounded-lg border border-black/[.08] p-4 dark:border-white/[.145]"
                    >
                      <p className="font-medium text-black dark:text-zinc-50">
                        {activity.title}{' '}
                        <span className="font-normal text-zinc-500 dark:text-zinc-400">
                          ({activity.category})
                        </span>
                      </p>
                      <p className="text-sm text-zinc-600 dark:text-zinc-400">
                        {[
                          activity.startTime && activity.endTime
                            ? `${activity.startTime}–${activity.endTime}`
                            : activity.startTime,
                          activity.placeName,
                          activity.costMinor != null && activity.costCurrency
                            ? formatMoney(activity.costMinor, activity.costCurrency)
                            : null,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      </main>
    </div>
  );
}
```

- [ ] **Step 3: Implement the page**

```tsx
// src/app/shared/[token]/page.tsx
import { InvalidShareLinkError } from '@/server/errors';
import { getSharedBudgetSummary, getSharedTrip } from '@/server/sharing';
import { SharedTripView } from './SharedTripView';

export default async function SharedTripPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  let data;
  let budget;
  try {
    [data, budget] = await Promise.all([
      getSharedTrip(token),
      getSharedBudgetSummary(token),
    ]);
  } catch (err) {
    if (err instanceof InvalidShareLinkError) {
      return (
        <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
          <p className="text-zinc-600 dark:text-zinc-400">{err.message}</p>
        </div>
      );
    }
    throw err;
  }

  return <SharedTripView data={data} budget={budget} />;
}
```

- [ ] **Step 4: Verify manually**

```bash
docker compose up -d db
npm run dev
```

As the owner, create a share link from the Sharing panel and open it in an incognito/private window (no session) — the trip should render read-only with no edit controls. Then revoke the link and reload — should show "This link is no longer valid."

- [ ] **Step 5: Commit**

```bash
git add src/app/shared
git commit -m "feat: public read-only trip view via share link"
```

---

## Task 15: E2E — accept-invite and share-link happy paths

**Files:**
- Create: `e2e/sharing.spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { expect, test } from '@playwright/test';

// These hit real routes without a signed-in session, matching this repo's
// existing e2e pattern (see e2e/smoke.spec.ts) of verifying redirect/render
// behavior rather than a full OAuth click-through (no test OAuth account
// exists in CI).
test.describe('sharing', () => {
  test('an invalid share token shows the "not valid" message, not a 500', async ({
    page,
  }) => {
    const response = await page.goto('/shared/this-token-does-not-exist');
    expect(response?.ok()).toBe(true);
    await expect(page.getByText('This link is no longer valid.')).toBeVisible();
  });

  test('the trips dashboard redirects to sign-in when signed out', async ({
    page,
  }) => {
    const response = await page.goto('/trips');
    await expect(page).toHaveURL(/\/api\/auth\/signin/);
    expect(response?.ok()).toBe(true);
  });
});
```

- [ ] **Step 2: Run it**

```bash
npm run dev &
npx playwright test e2e/sharing.spec.ts
```

Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add e2e/sharing.spec.ts
git commit -m "test: e2e coverage for invalid share tokens and dashboard auth gate"
```

---

## Task 16: Verify, open PR, merge

**Files:** none (verification + git workflow only)

- [ ] **Step 1: Full verification**

```bash
npx tsc --noEmit
npm run lint
npm run format:check
docker compose up -d db
npm run test
npx playwright install --with-deps chromium
npm run test:e2e
```

Expected: everything green.

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/phase2-sharing
gh pr create --title "feat: Phase 2 trip sharing (public link + co-editors)" --body "Implements docs/superpowers/plans/2026-08-11-phase2-sharing.md per docs/superpowers/specs/2026-08-11-phase2-sharing-export-design.md. Adds requireTripAccess/requireTripOwner authorization split, TripCollaborator model, public read-only share link, and invite/accept/decline collaborator flow."
gh pr checks --watch
```

- [ ] **Step 3: Merge and clean up**

```bash
gh pr merge --squash
git checkout main && git pull
git branch -d feat/phase2-sharing
```

---

## Deliberately deferred (per spec)

- Removing a collaborator's own access (self-leave).
- Any outbound email notification for invites — the dashboard card is the only surface.
- Converting a public-link viewer into a collaborator from the share page itself.
