# ADR-0003: Optimistic locking from day one

**Status:** Accepted (2026-07-23)

## Context
Phase 2 adds trip sharing with Collaborators. Retrofitting concurrency control onto every
mutation after the fact is error-prone; Phase 1 is single-owner, so the cost of adding it
now is small and conflicts are impossible until sharing lands.

## Decision
Every mutable model (Trip, Day, Activity, Expense) carries `updatedAt DateTime @updatedAt`.
Mutations receive the client's last-seen `updatedAt` and reject the write if the row's
current value differs (stale write → error telling the user to reload).

## Consequences
- Extends the Tech Scope §2.1 schema and every mutation in Tasks 4–6.
- Small per-write cost now; zero retrofit when Phase 2 co-editing arrives.
- **2026-08-11:** `TripCollaborator` (Phase 2 sharing, [Sharing](../../knowledge/domain/sharing.md))
  also carries `updatedAt` per this rule, even though its mutations are create/status-transition/
  delete rather than field-level edits — no client-supplied stale-write check is wired up for it,
  the column exists for schema consistency.
