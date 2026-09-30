import { describe, expect, it } from 'vitest';
import { formatDateRange, formatDay, tripLengthDays } from './format';

describe('formatDay', () => {
  it('is pinned to UTC — renders the same calendar day regardless of the runtime TZ', () => {
    // Day.date is stored as UTC midnight. If the pin were dropped, a runtime
    // whose local TZ is west of UTC would render this as "Monday, Aug 31"
    // instead of the correct "Tuesday, Sep 1" — off by a day.
    const utcMidnight = new Date('2026-09-01T00:00:00.000Z');
    const formatted = formatDay(utcMidnight);
    expect(formatted).toContain('Tuesday');
    expect(formatted).toContain('Sep');
    expect(formatted).toContain('1');
  });

  it('does not hardcode a locale — uses whichever fields Intl resolves for the environment', () => {
    // Locale-independent assertion: check the semantic pieces (weekday,
    // month, day number) rather than a literal 'en-US'-shaped string, since
    // dropping the hardcoded 'en-US' argument means output legitimately
    // varies by the runtime's default locale.
    const date = new Date('2026-12-25T00:00:00.000Z');
    const parts = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).formatToParts(date);
    const expected = parts.map((p) => p.value).join('');
    expect(formatDay(date)).toBe(expected);
  });
});

describe('formatDateRange', () => {
  it('formats both ends of the range', () => {
    const start = new Date('2026-09-01T00:00:00.000Z');
    const end = new Date('2026-09-05T00:00:00.000Z');
    const formatted = formatDateRange(start, end);
    expect(formatted).toContain('–');
    // Both years should be present since 'year: numeric' is always included.
    expect(formatted).toContain('2026');
  });

  it('is NOT UTC-pinned — matches the existing (unchanged) behaviour', () => {
    // Deliberately preserving current behaviour exactly, per the task's
    // binding constraint: formatDateRange has no `timeZone: 'UTC'` option
    // today, so this test pins that fact rather than "fixing" it.
    const start = new Date('2026-09-01T00:00:00.000Z');
    const end = new Date('2026-09-05T00:00:00.000Z');
    const fmt = new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
    expect(formatDateRange(start, end)).toBe(
      `${fmt.format(start)} – ${fmt.format(end)}`,
    );
  });
});

// formatDate (used for real timestamps, not calendar days) was removed from
// this module after testing surfaced a hydration-mismatch regression: both
// of its only callers (AiKeyPanel.tsx, ExtensionTokenPanel.tsx) are
// 'use client' components, where an `undefined`-locale formatter can
// legitimately render different text on the server than in the browser.
// They now each keep a local formatter with the locale hardcoded to
// 'en-US' — see src/lib/format.ts's module doc for the full explanation.

describe('tripLengthDays', () => {
  const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

  it('counts both ends of the range (inclusive)', () => {
    expect(tripLengthDays(d('2026-12-01'), d('2026-12-01'))).toBe(1);
    expect(tripLengthDays(d('2026-12-01'), d('2026-12-02'))).toBe(2);
    expect(tripLengthDays(d('2026-11-14'), d('2026-11-23'))).toBe(10);
  });

  it('counts UTC calendar days across a DST change and a year boundary', () => {
    expect(tripLengthDays(d('2026-03-28'), d('2026-03-30'))).toBe(3);
    expect(tripLengthDays(d('2026-12-30'), d('2027-01-02'))).toBe(4);
  });
});
