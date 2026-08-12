---
type: Integration
title: Auth & authorization
description: Auth.js OAuth for identity plus requireTripAccess/requireTripOwner, the rules that gate every nested resource.
resource: ../../docs/Trip_Planner_Tech_Scope.md
tags: [integration, auth, security]
timestamp: 2026-06-15T00:00:00Z
---

# Schema

- **Identity** — Auth.js with an OAuth provider (Google or GitHub) + Prisma adapter, so there is
  no password handling; sessions live in the DB. `middleware.ts` guards `/trips/*`.
- **Authorization** — every read is filtered by the authenticated user or an accepted
  [Collaborator](/domain/sharing.md); every mutation re-checks this via `requireTripAccess(tripId)`.
  Owner-only actions (deleting the trip, managing sharing) instead use `requireTripOwner(tripId)`,
  which skips the collaborator check entirely.

⚠️ Nested resources (Day / Activity / Expense) are **always** reached through `requireTripAccess` —
never queried by their own id alone. This is the no-bypass guarantee that prevents the classic
IDOR vulnerability.

# Citations

[Tech Scope §2.2 and Task 3](../../docs/Trip_Planner_Tech_Scope.md).
