import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  daySubtotals,
  isToday,
  nextActivityId,
  type RailActivity,
} from './dayRail';

function activity(overrides: Partial<RailActivity> = {}): RailActivity {
  return {
    id: 'a1',
    startTime: null,
    costMinor: null,
    costCurrency: null,
    ...overrides,
  };
}

describe('isToday', () => {
  it('is true when the day and now share the same UTC calendar day', () => {
    const now = new Date(Date.UTC(2026, 7, 24, 10, 0));
    const day = new Date(Date.UTC(2026, 7, 24));
    expect(isToday(day, now)).toBe(true);
  });

  it('is false when the day is a different UTC calendar day', () => {
    const now = new Date(Date.UTC(2026, 7, 24, 10, 0));
    const day = new Date(Date.UTC(2026, 7, 25));
    expect(isToday(day, now)).toBe(false);
  });

  describe('regression guard (finding 1): UTC-pinned Day.date vs. viewer local date', () => {
    // Before the fix, isTodayLocal compared Day.date's UTC calendar key
    // against the *browser-local* calendar key (via now.getFullYear() /
    // getMonth() / getDate()). That broke in both directions. These tests
    // simulate a device whose local wall-clock date has diverged from the
    // UTC date by stubbing the local getters — proving the fixed
    // implementation ignores them entirely and only ever compares UTC to
    // UTC, however the local getters answer.
    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('east of UTC: local date already rolled to tomorrow does not badge tomorrow "Today" early', () => {
      // Real current instant: Aug 24, 23:00 UTC — "today" in UTC terms is
      // still the 24th. Day.date for the 25th (UTC midnight) hasn't started
      // yet by the UTC-pinned convention the rest of the app uses.
      const now = new Date(Date.UTC(2026, 7, 24, 23, 0));
      const tomorrowsDay = new Date(Date.UTC(2026, 7, 25));

      // A device east of UTC (e.g. UTC+9) would have already rolled its
      // *local* calendar to the 25th at this instant — simulate that by
      // making the local getters report the 25th.
      vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
      vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(7);
      vi.spyOn(Date.prototype, 'getDate').mockReturnValue(25);

      expect(isToday(tomorrowsDay, now)).toBe(false);
    });

    it('west of UTC: local date still yesterday does not keep yesterday badged "Today"', () => {
      // Real current instant: Aug 25, 01:00 UTC — "today" in UTC terms is
      // now the 25th. Day.date for the 24th is yesterday's day and should
      // no longer be highlighted.
      const now = new Date(Date.UTC(2026, 7, 25, 1, 0));
      const yesterdaysDay = new Date(Date.UTC(2026, 7, 24));

      // A device west of UTC (e.g. UTC-9) would still have a *local*
      // calendar date of the 24th at this instant — simulate that by making
      // the local getters report the 24th.
      vi.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2026);
      vi.spyOn(Date.prototype, 'getMonth').mockReturnValue(7);
      vi.spyOn(Date.prototype, 'getDate').mockReturnValue(24);

      expect(isToday(yesterdaysDay, now)).toBe(false);
    });
  });
});

describe('nextActivityId', () => {
  it('picks the first activity whose startTime has not passed yet', () => {
    const now = new Date(Date.UTC(2026, 7, 24, 10, 30)); // 10:30 UTC
    const activities = [
      activity({ id: 'past', startTime: '09:00' }),
      activity({ id: 'upcoming', startTime: '11:00' }),
      activity({ id: 'later', startTime: '14:00' }),
    ];
    expect(nextActivityId(activities, now)).toBe('upcoming');
  });

  it('skips activities with no startTime without blocking later ones', () => {
    const now = new Date(Date.UTC(2026, 7, 24, 10, 30));
    const activities = [
      activity({ id: 'no-time', startTime: null }),
      activity({ id: 'upcoming', startTime: '11:00' }),
    ];
    expect(nextActivityId(activities, now)).toBe('upcoming');
  });

  it('returns null when every activity is already in the past', () => {
    const now = new Date(Date.UTC(2026, 7, 24, 20, 0)); // 20:00 UTC
    const activities = [
      activity({ id: 'a', startTime: '09:00' }),
      activity({ id: 'b', startTime: '12:00' }),
    ];
    expect(nextActivityId(activities, now)).toBeNull();
  });

  it('returns null for an empty activity list', () => {
    const now = new Date(Date.UTC(2026, 7, 24, 10, 0));
    expect(nextActivityId([], now)).toBeNull();
  });
});

describe('daySubtotals', () => {
  it('sums costMinor per currency without converting across currencies', () => {
    const activities = [
      activity({ costMinor: 1000, costCurrency: 'JPY' }),
      activity({ costMinor: 2000, costCurrency: 'JPY' }),
      activity({ costMinor: 500, costCurrency: 'USD' }),
    ];
    expect(daySubtotals(activities)).toEqual([
      { currency: 'JPY', minor: 3000 },
      { currency: 'USD', minor: 500 },
    ]);
  });

  it('ignores activities with no cost', () => {
    const activities = [
      activity({ costMinor: null, costCurrency: null }),
      activity({ costMinor: 100, costCurrency: null }),
    ];
    expect(daySubtotals(activities)).toEqual([]);
  });

  it('returns an empty array for a day with no activities', () => {
    expect(daySubtotals([])).toEqual([]);
  });
});
