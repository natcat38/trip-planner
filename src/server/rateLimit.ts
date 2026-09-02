/**
 * Coarse fixed-window rate limiting for the app's unauthenticated / token-only
 * boundary: duplicateSharedTrip (anyone with a share link) and
 * /api/extension/* (anyone with a bearer token). $0/month constraint
 * (ADR-0001) rules out Redis or any other paid rate-limiting service, and an
 * in-memory counter would not survive Vercel's per-invocation serverless
 * instances — two requests seconds apart can land on two different
 * instances with two different counters. So the window lives in Postgres,
 * in the RateLimitBucket table, which every instance already shares.
 *
 * Deliberately fixed-window, not sliding-log or token-bucket: a caller can
 * burst up to 2x the limit across a window boundary, but this is a coarse
 * abuse guard against a runaway script or a leaked token, not a precise
 * quota, so that imprecision is an acceptable trade for one row and one
 * query per check.
 * @packageDocumentation
 */

import { NextResponse } from 'next/server';
import { db } from '../lib/db';
import { RateLimitError } from './errors';

// No key ever expires on its own (a fixed window is only ever inserted or
// bumped, never deleted), so buckets for one-off keys — a revoked share
// token, an old extension user id — accumulate forever. There's no cron
// (ADR-0001: $0/month, no always-on infra), so cleanup instead rides along
// on checkRateLimit itself.
// ponytail: a random 1-in-100 chance per call, not "every Nth call" or a
// separate scheduled sweep — no counter to keep in sync, no extra table, no
// infra. A bucket older than a day is stale under every current window
// (the longest is 1 hour), so 24h is a generous, simple cutoff.
const CLEANUP_PROBABILITY = 0.01;
const STALE_BUCKET_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export async function cleanupStaleBuckets(
  maxAgeMs: number = STALE_BUCKET_MAX_AGE_MS,
): Promise<number> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const { count } = await db.rateLimitBucket.deleteMany({
    where: { windowStart: { lt: cutoff } },
  });
  return count;
}

// One statement: INSERT .. ON CONFLICT DO UPDATE takes a row-level lock on
// the conflicting key for the duration of the statement, so two concurrent
// requests for the same key increment serially rather than racing each other
// to read-then-write the same count.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  if (Math.random() < CLEANUP_PROBABILITY) {
    await cleanupStaleBuckets();
  }

  const now = Date.now();
  const windowStart = new Date(now - (now % windowMs));
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" (key, "windowStart", count)
    VALUES (${key}, ${windowStart}, 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN "RateLimitBucket"."windowStart" = EXCLUDED."windowStart"
        THEN "RateLimitBucket".count + 1
        ELSE 1
      END,
      "windowStart" = EXCLUDED."windowStart"
    RETURNING count;
  `;
  return rows[0].count <= limit;
}

// Shared policy for both browser-extension routes: keyed by userId (one
// active token per user, per extensionToken.ts), 30 requests/minute each in
// their own bucket (prefixed per route below) so one endpoint being hammered
// doesn't spend the other's budget.
export const EXTENSION_RATE_LIMIT = 30;
export const EXTENSION_RATE_WINDOW_MS = 60 * 1000;

// Shared 429 response for the two bearer-token extension routes (dedupes the
// duplicated block that used to live in both route.ts files).
export async function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<NextResponse | null> {
  const allowed = await checkRateLimit(key, limit, windowMs);
  if (allowed) return null;
  return NextResponse.json(
    { error: new RateLimitError().message },
    {
      status: 429,
    },
  );
}
