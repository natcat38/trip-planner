# ADR-0003: Optimistic locking from day one

**Status:** Accepted (2026-07-23)

## Context
Phase 2 adds trip sharing with co-editors. Retrofitting concurrency control onto every
mutation after the fact is error-prone; Phase 1 is single-owner, so the cost of adding it
now is small and conflicts are impossible until sharing lands.

## Decision
Every mutable model (Trip, Day, Activity, Expense) carries `updatedAt DateTime @updatedAt`.
Mutations receive the client's last-seen `updatedAt` and reject the write if the row's
current value differs (stale write → error telling the user to reload).

## Consequences
- Extends the Tech Scope §2.1 schema and every mutation in Tasks 4–6.
- Small per-write cost now; zero retrofit when Phase 2 co-editing arrives.
