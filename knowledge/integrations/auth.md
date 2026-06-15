---
type: Integration
title: Auth & authorization
description: Auth.js OAuth for identity plus the single requireTrip rule that gates every nested resource.
resource: ../../docs/Trip_Planner_Tech_Scope.md
tags: [integration, auth, security]
timestamp: 2026-06-15T00:00:00Z
---

# Schema

- **Identity** — Auth.js with an OAuth provider (Google or GitHub) + Prisma adapter, so there is
  no password handling; sessions live in the DB. `middleware.ts` guards `/trips/*`.
- **Authorization (the single rule)** — every read is filtered by the authenticated user; every
  mutation re-checks ownership via `requireTrip(tripId)`, which looks up the
  [trip](/domain/trip.md) by `{ id, userId }` and throws if it isn't the caller's.

⚠️ Nested resources (Day / Activity / Expense) are **always** reached through `requireTrip` —
never queried by their own id alone. This is the no-bypass guarantee that prevents the classic
IDOR vulnerability.

# Citations

[Tech Scope §2.2 and Task 3](../../docs/Trip_Planner_Tech_Scope.md).
