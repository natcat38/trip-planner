import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetTransitousStateForTests,
  planJourney,
  type Journey,
} from './transitous';

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

const TOKYO = { lat: 35.6812, lng: 139.7671 };
const TOKYO_TOWER = { lat: 35.6586, lng: 139.7454 };
const WHEN = new Date('2026-09-01T09:00:00.000Z');

// A realistic-shaped itinerary, deliberately carrying the heavy fields the real API returns
// (alerts / intermediateStops / steps / verbose from-tripFrom) that transitous.ts must drop
// before returning anything to a caller (docs/phase-3-research-layer-handoff.md §3.8: a Paris
// route runs 1.8MB, mostly these fields).
function heavyItinerary() {
  return {
    duration: 1080,
    startTime: '2026-09-01T09:05:00.000Z',
    endTime: '2026-09-01T09:23:00.000Z',
    transfers: 1,
    id: 'itin-1',
    legs: [
      {
        mode: 'WALK',
        from: {
          name: 'Tokyo Station',
          lat: 35.6812,
          lon: 139.7671,
          tripFrom: { huge: 'x'.repeat(1000) },
        },
        to: { name: 'Otemachi', lat: 35.685, lon: 139.764 },
        duration: 300,
        intermediateStops: [{ name: 'skip me' }],
        steps: [{ instruction: 'walk north' }, { instruction: 'turn left' }],
        alerts: ['service disruption text '.repeat(50)],
      },
      {
        mode: 'SUBWAY',
        from: { name: 'Otemachi', lat: 35.685, lon: 139.764 },
        to: { name: 'Kamiyacho', lat: 35.663, lon: 139.744 },
        duration: 780,
        routeShortName: 'Hibiya Line',
        headsign: 'Naka-meguro',
        agencyName: 'Tokyo Metro',
        intermediateStops: [{ name: 'skip 2' }],
        steps: [],
        alerts: [],
      },
    ],
  };
}

beforeEach(() => {
  __resetTransitousStateForTests();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-08-20T12:00:00.000Z'));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('planJourney', () => {
  it('projects a realistic response into Journey[], dropping alerts/intermediateStops/steps', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse({ itineraries: [heavyItinerary()] })),
    );

    const result = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
    const expected: Journey[] = [
      {
        durationSeconds: 1080,
        transfers: 1,
        startTime: '2026-09-01T09:05:00.000Z',
        endTime: '2026-09-01T09:23:00.000Z',
        legs: [
          {
            mode: 'WALK',
            from: 'Tokyo Station',
            to: 'Otemachi',
            durationSeconds: 300,
            line: null,
            headsign: null,
            agency: null,
          },
          {
            mode: 'SUBWAY',
            from: 'Otemachi',
            to: 'Kamiyacho',
            durationSeconds: 780,
            line: 'Hibiya Line',
            headsign: 'Naka-meguro',
            agency: 'Tokyo Metro',
          },
        ],
      },
    ];

    expect(result).toEqual(expected);
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('alerts');
    expect(serialized).not.toContain('intermediateStops');
    expect(serialized).not.toContain('steps');
    expect(serialized).not.toContain('tripFrom');
  });

  it('returns [] (not null) when Transitous confirms zero itineraries — the Kinkaku-ji case', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ itineraries: [] })),
    );

    const result = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
    expect(result).toEqual([]);
  });

  it('returns null (never throws) on a network error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')));
    const result = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
    expect(result).toBeNull();
  });

  it('returns null (never throws) on a non-ok response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const result = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
    expect(result).toBeNull();
  });

  it('returns null (never throws) on a timeout/abort', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const err = new DOMException('The operation was aborted', 'AbortError');
        return Promise.reject(err);
      }),
    );
    const result = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
    expect(result).toBeNull();
  });

  describe('line resolution', () => {
    // Real legs pulled from a live Tokyo Station -> Tokyo Tower response
    // (coordinator's live test, 2026-08-20): Japanese regional-rail feeds put an internal
    // numeric route ID in routeShortName with an empty routeLongName, which would otherwise
    // render as the meaningless "line 8478511".
    function itineraryWithLeg(leg: Record<string, unknown>) {
      return {
        duration: 600,
        startTime: '2026-09-01T09:05:00.000Z',
        endTime: '2026-09-01T09:15:00.000Z',
        transfers: 0,
        legs: [
          {
            mode: 'REGIONAL_RAIL',
            from: { name: 'A' },
            to: { name: 'B' },
            duration: 600,
            ...leg,
          },
        ],
      };
    }

    it('falls back to the agency name when routeShortName is an internal numeric ID with no routeLongName', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse({
            itineraries: [
              itineraryWithLeg({
                routeShortName: '8478511',
                routeLongName: '',
                headsign: '日吉(神奈川県)',
                agencyName: '都営地下鉄',
              }),
            ],
          }),
        ),
      );

      const result = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
      expect(result?.[0].legs[0].line).toBe('都営地下鉄');
      expect(result?.[0].legs[0].headsign).toBe('日吉(神奈川県)');
      expect(result?.[0].legs[0].agency).toBe('都営地下鉄');
    });

    it('prefers a non-empty routeLongName over routeShortName', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse({
            itineraries: [
              itineraryWithLeg({
                mode: 'SUBWAY',
                routeShortName: 'E',
                routeLongName: '都営大江戸線 Toei Ōedo Line',
                headsign: '(普通 Local) 光が丘 Hikarigaoka',
                agencyName: '都営地下鉄 Toei Subway',
              }),
            ],
          }),
        ),
      );

      const result = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
      expect(result?.[0].legs[0].line).toBe('都営大江戸線 Toei Ōedo Line');
    });

    it('keeps a short numeric routeShortName that is a real route number, not an internal ID', async () => {
      // Lisbon bus: legitimately just "728", no long name.
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse({
            itineraries: [
              itineraryWithLeg({
                mode: 'BUS',
                routeShortName: '728',
                routeLongName: '',
                agencyName: 'Carris',
              }),
            ],
          }),
        ),
      );

      const result = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
      expect(result?.[0].legs[0].line).toBe('728');
    });

    it('projects headsign and agency through for every leg', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          jsonResponse({
            itineraries: [
              itineraryWithLeg({
                routeShortName: '9577961',
                routeLongName: '',
                headsign: '日吉(神奈川県)',
                agencyName: 'JR',
              }),
            ],
          }),
        ),
      );

      const result = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
      expect(result?.[0].legs[0].headsign).toBe('日吉(神奈川県)');
      expect(result?.[0].legs[0].agency).toBe('JR');
      expect(result?.[0].legs[0].line).toBe('JR'); // internal ID dropped, agency wins
    });
  });

  describe('rate limit', () => {
    it('the 11th call inside a minute returns null without calling fetch', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ itineraries: [] }));
      vi.stubGlobal('fetch', fetchMock);

      // Distinct coordinates per call so the cache never short-circuits the rate limiter.
      for (let i = 0; i < 10; i++) {
        const result = await planJourney(
          { lat: 35 + i, lng: 139 },
          TOKYO_TOWER,
          WHEN,
        );
        expect(result).toEqual([]);
      }
      expect(fetchMock).toHaveBeenCalledTimes(10);

      const eleventh = await planJourney(
        { lat: 50, lng: 139 },
        TOKYO_TOWER,
        WHEN,
      );
      expect(eleventh).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(10);
    });
  });

  describe('circuit breaker', () => {
    it('opens after 3 consecutive failures, blocks a 4th call without fetching, then retries after the cooldown', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('down'));
      vi.stubGlobal('fetch', fetchMock);

      await planJourney(TOKYO, TOKYO_TOWER, WHEN);
      await planJourney(TOKYO, TOKYO_TOWER, WHEN);
      await planJourney(TOKYO, TOKYO_TOWER, WHEN);
      expect(fetchMock).toHaveBeenCalledTimes(3);

      const fourth = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
      expect(fourth).toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(3); // breaker blocked it — no fetch call

      // Advance past the 60s cooldown.
      vi.setSystemTime(new Date(Date.now() + 61_000));
      fetchMock.mockResolvedValue(jsonResponse({ itineraries: [] }));

      const afterCooldown = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
      expect(afterCooldown).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(4);
    });
  });

  describe('cache', () => {
    it('two lookups with coordinates differing in the 6th decimal and times 3 minutes apart hit the cache once', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ itineraries: [heavyItinerary()] }));
      vi.stubGlobal('fetch', fetchMock);

      const first = await planJourney(
        TOKYO,
        { lat: TOKYO_TOWER.lat, lng: TOKYO_TOWER.lng },
        WHEN,
      );

      const second = await planJourney(
        { lat: TOKYO.lat + 0.0000004, lng: TOKYO.lng },
        { lat: TOKYO_TOWER.lat, lng: TOKYO_TOWER.lng + 0.0000004 },
        new Date(WHEN.getTime() + 3 * 60 * 1000),
      );

      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(second).toEqual(first);
    });

    it('does not re-fetch a cached empty result', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ itineraries: [] }));
      vi.stubGlobal('fetch', fetchMock);

      const first = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
      const second = await planJourney(TOKYO, TOKYO_TOWER, WHEN);

      expect(first).toEqual([]);
      expect(second).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('retries a failure on the next call instead of caching it', async () => {
      const fetchMock = vi.fn().mockRejectedValue(new Error('down'));
      vi.stubGlobal('fetch', fetchMock);

      const first = await planJourney(TOKYO, TOKYO_TOWER, WHEN);
      expect(first).toBeNull();

      fetchMock.mockResolvedValue(jsonResponse({ itineraries: [] }));
      const second = await planJourney(TOKYO, TOKYO_TOWER, WHEN);

      expect(second).toEqual([]);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
