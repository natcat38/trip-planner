'use server';

/**
 * Group voting on itinerary activities (Phase 3 M5): a single thumbs-up per
 * person per activity — presence of an ActivityVote row IS the vote, so
 * un-voting is a delete rather than flipping a boolean. Mirrors
 * src/server/places.ts's shape and authorization pattern.
 *
 * Voter identity is always the current session's verified OAuth email
 * (ADR-0006's collaborator-by-email approach — a collaborator may not have a
 * User row), never anything client-supplied. Votes are deliberately excluded
 * from getSharedTrip (src/server/sharing.ts) — they are a collaboration
 * signal for people with trip access, not part of the public read-only
 * share surface.
 * @packageDocumentation
 */

import { Prisma } from '../generated/prisma/client';
import { db } from '../lib/db';
import { currentUserEmail, requireTripAccess } from './auth-scope';
import { requireActivity } from './itinerary';

export interface VoteSummary {
  count: number;
  voters: string[];
  mine: boolean;
}

// Presence IS the vote: if the caller already voted, remove that row;
// otherwise add one. The unique index on [activityId, voterEmail] is what
// makes a racing double-submit (two clicks firing the toggle concurrently)
// safe to create against — see the P2002 catch below.
export async function toggleVote(
  tripId: string,
  activityId: string,
): Promise<void> {
  const activity = await requireActivity(tripId, activityId);
  const voterEmail = await currentUserEmail();

  const existing = await db.activityVote.findUnique({
    where: { activityId_voterEmail: { activityId: activity.id, voterEmail } },
  });

  if (existing) {
    // Another request may have already deleted this same row between our
    // read and this delete (the same double-submit race, the other way) —
    // deleteMany is a no-op instead of throwing P2025 when that happens.
    await db.activityVote.deleteMany({
      where: { activityId: activity.id, voterEmail },
    });
    return;
  }

  try {
    await db.activityVote.create({
      data: { activityId: activity.id, voterEmail },
    });
  } catch (err) {
    // A second concurrent click can lose the findUnique race and hit the
    // @@unique([activityId, voterEmail]) constraint on create — that just
    // means the vote already exists, which is the desired end state, not an
    // error worth a 500.
    if (
      err instanceof Prisma.PrismaClientKnownRequestError &&
      err.code === 'P2002'
    ) {
      return;
    }
    throw err;
  }
}

// tripId-scoped rather than a single activity's votes, so the itinerary page
// can render every activity's tally with one query instead of one per
// activity.
export async function listVotesForTrip(
  tripId: string,
): Promise<Record<string, VoteSummary>> {
  const trip = await requireTripAccess(tripId);
  const myEmail = await currentUserEmail();

  const votes = await db.activityVote.findMany({
    where: { activity: { day: { tripId: trip.id } } },
    orderBy: { createdAt: 'asc' },
  });

  const summary: Record<string, VoteSummary> = {};
  for (const vote of votes) {
    const entry = summary[vote.activityId] ?? {
      count: 0,
      voters: [],
      mine: false,
    };
    entry.count += 1;
    entry.voters.push(vote.voterEmail);
    if (vote.voterEmail === myEmail) entry.mine = true;
    summary[vote.activityId] = entry;
  }
  return summary;
}
