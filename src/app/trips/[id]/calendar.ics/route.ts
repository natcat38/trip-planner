/**
 * The .ics calendar export for one trip: every activity across all of the
 * trip's days as an RFC 5545 VEVENT, downloadable/subscribable into any
 * calendar app. Gated by requireTripAccess(tripId) like every other nested
 * resource (CLAUDE.md) — `/trips/:path*` is also covered by the proxy's auth
 * matcher, so this is defence in depth, not the only gate.
 * @packageDocumentation
 */
import { NextResponse } from 'next/server';
import { buildIcs, type IcsEvent } from '@/lib/ics';
import {
  ForbiddenOrNotFoundError,
  requireTripAccess,
} from '@/server/auth-scope';
import { ensureDaysForTrip } from '@/server/itinerary';

// Fixed domain suffix for UIDs, matching the app's canonical host used
// elsewhere for outbound identification (src/lib/research/userAgent.ts).
// Deriving the UID from the activity id keeps it stable across re-exports,
// so re-importing the same .ics updates existing calendar events instead of
// duplicating them.
const UID_DOMAIN = 'trip-planner-cyan-five.vercel.app';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let trip;
  let days;
  try {
    trip = await requireTripAccess(id);
    days = await ensureDaysForTrip(id);
  } catch (err) {
    if (err instanceof ForbiddenOrNotFoundError) {
      return new NextResponse(err.message, { status: 404 });
    }
    throw err;
  }

  const events: IcsEvent[] = days.flatMap((day) =>
    day.activities.map((activity) => ({
      uid: `${activity.id}@${UID_DOMAIN}`,
      title: activity.title,
      date: day.date,
      startTime: activity.startTime,
      endTime: activity.endTime,
      location: activity.placeName,
      description: activity.notes,
    })),
  );

  const ics = buildIcs(trip.name, events);

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': `attachment; filename="${trip.name.replace(/[^a-z0-9]+/gi, '-')}.ics"`,
    },
  });
}
