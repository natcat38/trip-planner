'use server';

/**
 * Trip sharing: a public read-only link (Trip.shareToken) and named
 * Collaborators (TripCollaborator, invited by email, explicitly accepted or
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
