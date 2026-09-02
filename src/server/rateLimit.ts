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

import { db } from '../lib/db';

// One statement: INSERT .. ON CONFLICT DO UPDATE takes a row-level lock on
// the conflicting key for the duration of the statement, so two concurrent
// requests for the same key increment serially rather than racing each other
// to read-then-write the same count.
export async function checkRateLimit(
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
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
