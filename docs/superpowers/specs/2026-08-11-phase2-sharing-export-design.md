# Phase 2 — Sharing & Export

**Status:** Approved (2026-08-11)
**Companion docs:** `docs/Trip_Planner_Product_Scope.md` §6 (Sharing & Export, deferred),
`docs/adr/0003-optimistic-locking.md` (mutation pattern this extends).

## 1. Scope & architecture

Two independent features, sharing first:

- **Sharing:** a public read-only link (token-based, no login) plus named co-editors
  (invite by email, accept/decline, full edit rights once accepted).
- **Export:** a dedicated print-friendly page per trip; an "Export PDF" button triggers
  the browser's native print-to-PDF. No new dependencies, no server-side rendering
  pipeline — fits the $0/month, Vercel-serverless constraint (ADR-0001).

Both build on the existing `requireTrip`-style authorization chain (`src/server/auth-scope.ts`)
rather than replacing it.

## 2. Data model

```prisma
model Trip {
  // ...existing fields...
  shareToken    String?            @unique  // set → public link enabled; null → disabled
  collaborators TripCollaborator[]
}

model TripCollaborator {
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

No `userId` FK on `TripCollaborator` — every access check matches the signed-in session's
verified OAuth email against `email`. Declining an invite deletes the row (re-inviting later
is just a fresh insert); there is no third "declined" state to carry around.

## 3. Authorization changes

`requireTrip` (owner-only) becomes two helpers in `src/server/auth-scope.ts`:

- **`requireTripAccess(tripId)`** — owner **OR** an `ACCEPTED` `TripCollaborator` row
  matching the session email. Replaces `requireTrip` at every existing call site
  (`requireDay`, `requireActivity`, expense actions, trip reads) — itinerary/activity/expense
  CRUD becomes open to accepted collaborators for free, no per-call-site logic changes beyond
  the rename.
- **`requireTripOwner(tripId)`** — owner only. Used for: deleting the trip, managing the
  share link (create/regenerate/revoke), inviting/removing collaborators.

Public share-link reads do not go through either helper — they look up `Trip` by `shareToken`
directly, no session required, and render read-only (existing itinerary/budget/map display,
edit affordances hidden).

## 4. New flows

- **Owner:** a "Sharing" panel on the trip page (owner-only, enforced by `requireTripOwner`
  server-side and hidden in the UI for collaborators) — toggle the public link on/off
  (regenerate rotates the token, invalidating the old URL), invite collaborators by email,
  see accepted/pending collaborators with a remove button.
- **Invitee:** signs in as normal; if their email has a `PENDING` row, the `/trips` dashboard
  shows a card above their trip list ("You've been invited to collaborate on *Trip Name*")
  with Accept/Decline. Accept flips status to `ACCEPTED`; decline deletes the row.
- **Export:** `/trips/[tripId]/print`, guarded by `requireTripAccess` (owner or accepted
  collaborator), renders a clean print stylesheet (itinerary day-by-day + budget summary, no
  nav/buttons); an "Export PDF" button calls `window.print()`.

## 5. Error handling

Extends `docs/Trip_Planner_Product_Scope.md` §4.6:

| Trigger | Outcome |
|---|---|
| Public link with revoked/regenerated token | 404-style "This link is no longer valid." |
| Collaborator attempts an owner-only action | `ForbiddenOrNotFoundError` (existing pattern) |
| Accept/decline an invite that isn't PENDING for your email | `ForbiddenOrNotFoundError` |
| Inviting an email already an ACCEPTED collaborator | Friendly validation message, not a duplicate row (`@@unique([tripId, email])` backs this) |

## 6. Testing

Same paired pattern as every prior milestone:

- Mocked `.test.ts` for the new server functions (`requireTripAccess`, `requireTripOwner`,
  invite/accept/decline, share-token lookup).
- `.db.test.ts` integration tests against real Postgres for the authorization boundary cases
  (collaborator can edit, non-collaborator can't, revoked link 404s, etc.).
- Playwright e2e for the accept-invite and export-page happy paths.

## Deliberately deferred

- Removing a collaborator's own access (self-leave) — only owner-initiated removal is in scope.
- Any email notification for invites — the dashboard card is the only surface; no outbound mail.
- Read-only viewers via the public link cannot be converted to collaborators from that page —
  they'd need an explicit invite from the owner.
