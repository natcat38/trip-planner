---
type: Domain Entity
title: Trip
description: The owned aggregate root — destinations, dates, base currency, and budget — that scopes all nested data.
resource: ../../docs/Trip_Planner_Tech_Scope.md
tags: [domain, prisma]
timestamp: 2026-06-15T00:00:00Z
---

# Schema

A `Trip` belongs to one `User` and carries `name`, `destinations[]`, `startDate`, `endDate`,
`baseCurrency` (ISO 4217), and `budgetMinor` (budget in base-currency minor units). It owns
[days and activities](/domain/itinerary.md) and `Expense` rows, indexed by `userId` with
cascade deletes Trip→Day→Activity.

The trip is the unit of ownership: every nested resource is reached **through** it, never by
its own id alone (see [auth](/integrations/auth.md)).

# Citations

[Tech Scope §2.1](../../docs/Trip_Planner_Tech_Scope.md).
