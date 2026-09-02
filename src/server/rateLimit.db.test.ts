import { afterEach, describe, expect, it } from 'vitest';
import { db } from '../lib/db';
import { checkRateLimit, cleanupStaleBuckets } from './rateLimit';

// Real Postgres, no mocks: the whole point of this helper is the atomic
// upsert against a real row, which a mocked db can't exercise.
const keys: string[] = [];

function uniqueKey(): string {
  const key = `test:${crypto.randomUUID()}`;
  keys.push(key);
  return key;
}

afterEach(async () => {
  await db.rateLimitBucket.deleteMany({ where: { key: { in: keys } } });
  keys.length = 0;
});

describe('checkRateLimit', () => {
  it('allows calls up to the limit within a window', async () => {
    const key = uniqueKey();
    expect(await checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(await checkRateLimit(key, 3, 60_000)).toBe(true);
    expect(await checkRateLimit(key, 3, 60_000)).toBe(true);
  });

  it('denies calls once the limit is exceeded within a window', async () => {
    const key = uniqueKey();
    expect(await checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(await checkRateLimit(key, 2, 60_000)).toBe(true);
    expect(await checkRateLimit(key, 2, 60_000)).toBe(false);
    // Still denied — it doesn't un-deny once past the limit within the
    // same window.
    expect(await checkRateLimit(key, 2, 60_000)).toBe(false);
  });

  it('tracks separate keys independently', async () => {
    const keyA = uniqueKey();
    const keyB = uniqueKey();
    expect(await checkRateLimit(keyA, 1, 60_000)).toBe(true);
    expect(await checkRateLimit(keyA, 1, 60_000)).toBe(false);
    // A different key has its own bucket, unaffected by keyA being spent.
    expect(await checkRateLimit(keyB, 1, 60_000)).toBe(true);
  });

  it('resets the count once a new window starts', async () => {
    const key = uniqueKey();
    // A 1ms window makes the very next call land in a new window without
    // needing a real sleep in the test.
    expect(await checkRateLimit(key, 1, 1)).toBe(true);
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(await checkRateLimit(key, 1, 1)).toBe(true);
  });
});

describe('cleanupStaleBuckets', () => {
  it('deletes only buckets older than the given max age', async () => {
    const staleKey = uniqueKey();
    const freshKey = uniqueKey();
    await db.rateLimitBucket.create({
      data: {
        key: staleKey,
        windowStart: new Date(Date.now() - 60_000),
        count: 1,
      },
    });
    await db.rateLimitBucket.create({
      data: { key: freshKey, windowStart: new Date(), count: 1 },
    });

    const deleted = await cleanupStaleBuckets(30_000);

    expect(deleted).toBeGreaterThanOrEqual(1);
    expect(
      await db.rateLimitBucket.findUnique({ where: { key: staleKey } }),
    ).toBeNull();
    expect(
      await db.rateLimitBucket.findUnique({ where: { key: freshKey } }),
    ).not.toBeNull();
  });
});
