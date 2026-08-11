# ADR-0006: TripCollaborator is matched by email, not a User foreign key

**Status:** Accepted (2026-08-11)

## Context
Phase 2 sharing lets a trip owner invite a Collaborator by email before that person
necessarily has an account. The obvious design is a `userId` FK on `TripCollaborator`,
resolved once the invitee signs up/signs in ("resolve on login") — but that requires a
resolution step somewhere in the auth flow, and an intermediate state where an invite exists
but isn't yet linked to any user.

## Decision
`TripCollaborator` has no `userId` column. Every access check (`requireTripAccess`,
`acceptInvite`, `declineInvite`, `listPendingInvites`) matches the current session's
**verified OAuth email** (Google/GitHub, per ADR-0004) against `TripCollaborator.email`
directly, at request time. There is nothing to resolve — the row is either matched or it
isn't, whether the invitee already had an account when invited or not.

## Consequences
- Simpler by construction: no resolution step, no orphaned pre-signup invite state to reason
  about, no risk of an invite silently failing to link if a signup flow changes shape.
- Trades away referential integrity: nothing prevents inviting an email that will never sign
  up, and there's no `User` relation to eagerly load a collaborator's profile data (name,
  image) — only the email string is available without a separate lookup.
- Hard to reverse: if a future feature needs richer per-collaborator user data, adding a
  `userId` FK later means backfilling it for every existing `TripCollaborator` row by
  matching `email` against `User.email` — a one-time migration, not a schema-only change.
- Depends on OAuth email verification staying true (ADR-0004's Google/GitHub providers both
  guarantee this today). If a future provider without verified email were ever added, this
  design would need revisiting.
