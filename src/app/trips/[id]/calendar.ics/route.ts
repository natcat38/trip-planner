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
import { db } from '@/lib/db';

// Fixed domain suffix for UIDs, matching the app's canonical host used
// elsewhere for outbound identification (src/lib/research/userAgent.ts).
// Deriving the UID from the activity id keeps it stable across re-exports,
// so re-importing the same .ics updates existing calendar events instead of
// duplicating them.
const UID_DOMAIN = 'trip-planner-cyan-five.vercel.app';

// Strips everything non-alphanumeric, which is also what stops a CR or LF in
// a trip name from injecting a response header. A wholly non-Latin name (this
// is a Japan/Europe planner — 福岡タワー旅行 is an ordinary trip name, not an
// exotic one) survives that with nothing left, so fall back to something
// identifiable rather than downloading a file called "-.ics".
function downloadName(tripName: string): string {
  const slug = tripName.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '');
  return `${slug || 'trip'}.ics`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  let trip;
  let days;
  try {
    trip = await requireTripAccess(id);
    // Read, don't materialise. ensureDaysForTrip() CREATES any missing Day
    // rows, and this URL is meant to be subscribed to — a calendar app
    // re-fetches it on its own schedule, so a write path here would mean
    // every poll mutates the database. A GET advertised for subscription has
    // to be safe to call repeatedly. Days missing from the range simply
    // contribute no events.
    days = await db.day.findMany({
      where: { tripId: trip.id },
      orderBy: { date: 'asc' },
      include: { activities: { orderBy: { sortOrder: 'asc' } } },
    });
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
      'Content-Disposition': `attachment; filename="${downloadName(trip.name)}"`,
    },
  });
}
