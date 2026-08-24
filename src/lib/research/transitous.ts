/**
 * Transit routing via Transitous (`https://api.transitous.org/api/`, community-hosted MOTIS
 * v2) — free, keyless, best-effort, **no SLA** (docs/phase-3-research-layer-handoff.md §3.8).
 * We are deliberately not sending the courtesy-volume email their usage policy suggests, so this
 * module has to throttle itself for real instead of trusting the maintainers to do it for us.
 * Server-only, never throws, module-level cache — same fallback philosophy as ../fx.ts and
 * ../geocode.ts.
 *
 * `planJourney` returns three distinct outcomes and callers must keep them apart:
 * - `Journey[]` with entries — real itineraries.
 * - `[]` — we asked and Transitous confirmed no route exists (e.g. a bus-only attraction not in
 *   the feed, §3.8's Kinkaku-ji case). This is a normal, first-class answer, not an error.
 * - `null` — we did not get an answer at all (rate-limited, breaker open, network failure,
 *   timeout, bad response). The UI should offer the Google/Apple Maps deep-link fallback here,
 *   not "no route exists".
 * @packageDocumentation
 */

import { createTtlCache } from '../ttl-cache';
import { USER_AGENT } from './userAgent';

const API_BASE = 'https://api.transitous.org/api/v1/plan';
const REQUEST_TIMEOUT_MS = 15_000;

export interface JourneyLeg {
  mode: string;
  from: string;
  to: string;
  durationSeconds: number;
  line: string | null;
  headsign: string | null;
  agency: string | null;
}

export interface Journey {
  durationSeconds: number;
  transfers: number;
  startTime: string;
  endTime: string;
  legs: JourneyLeg[];
}

interface Coordinates {
  lat: number;
  lng: number;
}

// --- Layer 1: cache with deliberately lossy keys -------------------------
//
// Real callers' coordinates and timestamps are never exactly equal between two lookups of "the
// same" journey (a re-render, a second user planning the same day), so a precise key would never
// hit. Rounding coordinates to 4dp (~11m — well under GPS/geocoding noise) and bucketing the
// departure time to 15 minutes collapses those near-duplicates onto the same key.
//
// Both a populated result and a confirmed-empty one are cached: "no route exists" is a stable
// fact about the route, same as a real itinerary. Failures are NOT cached — a timeout is
// transient and caching it would turn one bad request into a standing false negative.
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // mirrors fx.ts / wikivoyage.ts's daily refresh
// ponytail: plain Map with a size cap, not an LRU — same tradeoff as geocode.ts's cache.
const MAX_CACHE_ENTRIES = 500;
const COORD_PRECISION = 4;
const TIME_BUCKET_MS = 15 * 60 * 1000;

const cache = createTtlCache<Journey[]>(CACHE_TTL_MS, MAX_CACHE_ENTRIES);

function roundCoord(n: number): number {
  return Math.round(n * 10 ** COORD_PRECISION) / 10 ** COORD_PRECISION;
}

function cacheKey(from: Coordinates, to: Coordinates, when: Date): string {
  const bucket = Math.floor(when.getTime() / TIME_BUCKET_MS);
  return `${roundCoord(from.lat)},${roundCoord(from.lng)}->${roundCoord(to.lat)},${roundCoord(to.lng)}@${bucket}`;
}

// --- Layer 2: token bucket, hard cutoff -----------------------------------
//
// Max 10 requests/minute per running instance. Over budget returns `null` immediately — no
// queueing, no sleeping, no retry. A serverless instance that's about to be recycled has no
// business holding a caller open to wait out a minute window.
// ponytail: per-instance, not a global/shared limiter — on serverless, N instances each get
// their own 10/min, so the real ceiling is N×10. Upgrade path: a shared store (Redis/Upstash)
// keyed by IP or trip if usage ever needs a true global cap.
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
let requestTimestamps: number[] = [];

function tryConsumeRateLimit(now: number): boolean {
  requestTimestamps = requestTimestamps.filter(
    (t) => now - t < RATE_LIMIT_WINDOW_MS,
  );
  if (requestTimestamps.length >= RATE_LIMIT_MAX) return false;
  requestTimestamps.push(now);
  return true;
}

// --- Layer 3: circuit breaker ---------------------------------------------
//
// After 3 consecutive failures/timeouts, stop calling Transitous entirely for a 60s cooldown and
// return `null` immediately — a struggling best-effort service doesn't need every caller's
// request piling on while it recovers. Any success resets the counter.
const BREAKER_FAILURE_THRESHOLD = 3;
const BREAKER_COOLDOWN_MS = 60 * 1000;
let consecutiveFailures = 0;
let breakerOpenedAt: number | null = null;

function breakerIsOpen(now: number): boolean {
  if (breakerOpenedAt == null) return false;
  if (now - breakerOpenedAt >= BREAKER_COOLDOWN_MS) {
    // Cooldown elapsed: half-open — let the next call through and judge by its outcome. The
    // failure count is left one short of the threshold rather than reset to zero, so a failed
    // trial re-opens the breaker immediately. Resetting to zero would grant a full fresh run of
    // attempts every cooldown, which is exactly the pile-on this layer exists to prevent.
    // recordSuccess() clears it properly when the trial actually succeeds.
    breakerOpenedAt = null;
    consecutiveFailures = BREAKER_FAILURE_THRESHOLD - 1;
    return false;
  }
  return true;
}

function recordFailure(now: number) {
  consecutiveFailures += 1;
  if (consecutiveFailures >= BREAKER_FAILURE_THRESHOLD) breakerOpenedAt = now;
}

function recordSuccess() {
  consecutiveFailures = 0;
  breakerOpenedAt = null;
}

export function __resetTransitousStateForTests(): void {
  cache.reset();
  requestTimestamps = [];
  consecutiveFailures = 0;
  breakerOpenedAt = null;
}

// --- Response shape (only the fields we keep) ------------------------------

interface PlanApiLeg {
  mode: string;
  from?: { name?: string };
  to?: { name?: string };
  duration?: number;
  routeShortName?: string;
  routeLongName?: string;
  headsign?: string;
  agencyName?: string;
}

// Every field optional: this describes an external response reached through an `as` cast, so
// treating any of it as guaranteed is wishful. Defaults are applied in toJourney.
interface PlanApiItinerary {
  duration?: number;
  startTime?: string;
  endTime?: string;
  transfers?: number;
  legs?: PlanApiLeg[];
}

interface PlanApiResponse {
  itineraries?: PlanApiItinerary[];
}

// Some feeds (observed live on Tokyo-area regional rail — Toei, JR) put an internal numeric
// route ID in `routeShortName` with an empty `routeLongName`, e.g. "8478511". Other feeds
// legitimately use short numeric route numbers — Lisbon's bus "728", or 2-4 digit routes
// elsewhere. There is no field that says which case we're in, so this is a heuristic, not a
// spec guarantee: treat a *purely numeric* `routeShortName` of length >= 5 as an internal ID.
// ponytail: a length cutoff, not a real ID-vs-route-number classifier — revisit if a legitimate
// 5+ digit route number ever surfaces (unseen so far) or a 4-digit internal ID does.
const INTERNAL_ROUTE_ID_PATTERN = /^\d{5,}$/;

function looksLikeInternalRouteId(routeShortName: string): boolean {
  return INTERNAL_ROUTE_ID_PATTERN.test(routeShortName);
}

// Resolves the human-facing "line" label a traveller would look for on a sign or announcement.
// Order: a real long name (e.g. "都営大江戸線 Toei Ōedo Line") beats everything since it's
// unambiguous; a short name is used only when it isn't an internal ID (keeps "728"/"E"/"M10",
// drops "8478511"); falling back to the agency name (e.g. "都営地下鉄") still tells the
// traveller which operator/platform to look for when neither name field is usable.
function resolveLine(leg: PlanApiLeg): string | null {
  if (leg.routeLongName) return leg.routeLongName;
  if (leg.routeShortName && !looksLikeInternalRouteId(leg.routeShortName))
    return leg.routeShortName;
  if (leg.agencyName) return leg.agencyName;
  return null;
}

// Projects the (huge — a Paris route runs 1.8MB, mostly `alerts`/`intermediateStops`/`steps` we
// never asked to keep) API response down to the compact shape this app actually uses. Anything
// not read here is garbage collected with the response, not retained.
function toJourney(itinerary: PlanApiItinerary): Journey {
  return {
    // Defaulted like the leg fields below: a missing duration would otherwise reach the UI as
    // undefined and render as the literal text "NaN min".
    durationSeconds: itinerary.duration ?? 0,
    transfers: itinerary.transfers ?? 0,
    startTime: itinerary.startTime ?? '',
    endTime: itinerary.endTime ?? '',
    legs: (itinerary.legs ?? []).map((leg) => ({
      mode: leg.mode,
      from: leg.from?.name ?? '',
      to: leg.to?.name ?? '',
      durationSeconds: leg.duration ?? 0,
      line: resolveLine(leg),
      headsign: leg.headsign ?? null,
      agency: leg.agencyName ?? null,
    })),
  };
}

function planUrl(from: Coordinates, to: Coordinates, when: Date): string {
  const params = new URLSearchParams({
    fromPlace: `${from.lat},${from.lng}`,
    toPlace: `${to.lat},${to.lng}`,
    time: when.toISOString(),
  });
  return `${API_BASE}?${params}`;
}

// Server-side only. Never throws. See the module doc comment above for the meaning of each of
// the three possible return shapes (populated array / empty array / null).
export async function planJourney(
  from: Coordinates,
  to: Coordinates,
  when: Date,
): Promise<Journey[] | null> {
  const key = cacheKey(from, to, when);
  const cached = cache.get(key);
  if (cached) return cached;

  const now = Date.now();
  if (breakerIsOpen(now)) return null;
  if (!tryConsumeRateLimit(now)) return null;

  try {
    const res = await fetch(planUrl(from, to, when), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) {
      recordFailure(Date.now());
      return null;
    }

    const data = (await res.json()) as PlanApiResponse;
    const journeys = (data.itineraries ?? []).map(toJourney);

    recordSuccess();
    cache.set(key, journeys);
    return journeys;
  } catch {
    // Network error, timeout/abort, or malformed JSON: never throw (house pattern).
    recordFailure(Date.now());
    return null;
  }
}
