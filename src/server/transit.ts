'use server';

/**
 * Transit routing between two activities already on a trip (Phase 3 M2).
 * Thin authorization + coordinate-resolution wrapper around
 * ../lib/research/transitous.ts's planJourney — mirrors src/server/places.ts's
 * shape.
 * @packageDocumentation
 */

import { db } from '../lib/db';
import { planJourney, type Journey } from '../lib/research/transitous';
import { requireActivity } from './itinerary';

// No real "what time is this traveller leaving" signal exists beyond the
// destination activity's own startTime, so when that's blank this is the one
// deliberately made-up input: noon UTC on the day in question. It's a
// reasonable "someone is probably out and about" instant for day-trip
// itineraries and isn't tuned further — Transitous's route coverage is a
// per-operator fact, not something that hinges on which exact hour we ask.
const DEFAULT_DEPARTURE_HOUR_UTC = 12;

function resolveDepartureTime(dayDate: Date, startTime: string | null): Date {
  const when = new Date(dayDate);
  if (startTime) {
    const [hours, minutes] = startTime.split(':').map(Number);
    when.setUTCHours(hours, minutes, 0, 0);
  } else {
    when.setUTCHours(DEFAULT_DEPARTURE_HOUR_UTC, 0, 0, 0);
  }
  return when;
}

/**
 * Plans a transit journey between two activities already on this trip.
 *
 * Deliberately takes activity ids, not raw coordinates. requireActivity
 * resolves and authorizes each one via requireTripAccess(tripId) before any
 * coordinate is ever read (CLAUDE.md: nested resources — Day/Activity/Expense
 * — are never authorized by their own id alone). A free-form lat/lng endpoint
 * would let any signed-in user use this route as a general-purpose Transitous
 * routing proxy against trips they don't even own, burning the shared
 * per-instance rate-limit budget ADR-0010 sets up for the whole app. Scoping
 * the inputs to activity ids the caller can already access bounds the abuse
 * surface to their own trips.
 */
export async function planJourneyBetweenActivities(
  tripId: string,
  fromActivityId: string,
  toActivityId: string,
): Promise<Journey[] | null> {
  const [fromActivity, toActivity] = await Promise.all([
    requireActivity(tripId, fromActivityId),
    requireActivity(tripId, toActivityId),
  ]);

  if (
    fromActivity.lat == null ||
    fromActivity.lng == null ||
    toActivity.lat == null ||
    toActivity.lng == null
  ) {
    // Nothing to route between. Returning null (not []) matters: we never
    // asked Transitous, and "no coordinates to route from" is a different
    // fact from "Transitous confirmed no route exists".
    return null;
  }

  const day = await db.day.findFirst({ where: { id: toActivity.dayId } });
  const when = day
    ? resolveDepartureTime(day.date, toActivity.startTime)
    : new Date();

  return planJourney(
    { lat: fromActivity.lat, lng: fromActivity.lng },
    { lat: toActivity.lat, lng: toActivity.lng },
    when,
  );
}
