---
type: Domain Entity
title: Sharing
description: A public read-only link plus named Collaborators (invited by email, accept/decline) granting edit access to a trip.
resource: ../../docs/adr/0006-collaborator-matched-by-email.md
tags: [domain, auth]
timestamp: 2026-08-11T00:00:00Z
---

# Schema

**Collaborator** (not "co-editor" — the product/tech scope docs and ADR-0003 predate this
resolution and still say "co-editor"; they mean the same thing) is the canonical term for
someone other than the [trip](/domain/trip.md) owner who has edit access. A `TripCollaborator`
row is created when the owner invites an email address, `status: PENDING`. It becomes
`status: ACCEPTED` only when that email's signed-in user explicitly accepts — there is no
implicit grant. Declining deletes the row rather than recording a third state.

An accepted Collaborator has the **same edit rights as the owner** over the trip's itinerary,
budget, and trip-level fields (name, dates, destinations, `baseCurrency`, `budgetMinor`) —
including trip-level financial config, since money is stored per-item in its original currency
and converted on read (see [Budget](/domain/budget.md)), so changing `baseCurrency` reframes
the roll-up rather than mutating stored data. Only deleting the trip and managing sharing
itself (the link, invites) are owner-only.

# Citations

[ADR-0006 — Collaborators matched by email](../../docs/adr/0006-collaborator-matched-by-email.md) and
[ADR-0007 — export via browser print](../../docs/adr/0007-export-via-browser-print.md); the
original Phase 2 design spec was retired once both were implemented (2026-08-24).
