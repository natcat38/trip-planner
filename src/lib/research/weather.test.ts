import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetWeatherCacheForTests, getTripWeather } from './weather';

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

// Fixed "today" so forecast-window/historical-shift math is deterministic.
const TODAY = '2026-08-20';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${TODAY}T00:00:00Z`));
  __resetWeatherCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('getTripWeather', () => {
  it('maps an in-window date to kind: forecast, with the probability populated and mm null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          daily: {
            time: ['2026-08-20', '2026-08-21', '2026-08-22'],
            weather_code: [3, 61, 3],
            temperature_2m_max: [29.6, 27.0, 28.0],
            temperature_2m_min: [26.2, 24.0, 25.0],
            precipitation_probability_max: [95, 80, 10],
          },
        }),
      ),
    );

    const result = await getTripWeather(33.5904, 130.4017, ['2026-08-22']);

    expect(result.get('2026-08-22')).toEqual({
      date: '2026-08-22',
      kind: 'forecast',
      maxC: 28.0,
      minC: 25.0,
      precipitationChance: 10,
      precipitationMm: null,
      code: 3,
      label: 'Partly cloudy',
    });
  });

  it('maps a far-future date to kind: historical, sourced from the same calendar date a year earlier, with mm populated and probability null', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        daily: {
          time: ['2025-09-10'],
          weather_code: [53],
          temperature_2m_max: [31.4],
          temperature_2m_min: [25.1],
          precipitation_sum: [1.9],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    // Well past the 16-day forecast window from 2026-08-20.
    const result = await getTripWeather(33.5904, 130.4017, ['2026-09-10']);

    expect(result.get('2026-09-10')).toEqual({
      date: '2026-09-10',
      kind: 'historical',
      maxC: 31.4,
      minC: 25.1,
      precipitationChance: null,
      precipitationMm: 1.9,
      code: 53,
      label: 'Drizzle',
    });

    // The requested date shifted back exactly one year, not the requested
    // date itself — an off-by-one here silently shows the wrong data.
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('archive-api.open-meteo.com');
    expect(url).toContain('start_date=2025-09-10');
    expect(url).toContain('end_date=2025-09-10');
  });

  it('issues exactly two requests for a mix of near and far dates, not one per day', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      if (url.includes('archive-api')) {
        return Promise.resolve(
          jsonResponse({
            daily: {
              time: ['2025-08-25', '2025-09-10'],
              weather_code: [1, 2],
              temperature_2m_max: [30, 31],
              temperature_2m_min: [24, 25],
              precipitation_sum: [0, 0.5],
            },
          }),
        );
      }
      return Promise.resolve(
        jsonResponse({
          daily: {
            time: ['2026-08-20', '2026-08-21'],
            weather_code: [0, 1],
            temperature_2m_max: [29, 30],
            temperature_2m_min: [25, 26],
            precipitation_probability_max: [5, 10],
          },
        }),
      );
    });
    vi.stubGlobal('fetch', fetchMock);

    // One date inside the 16-day forecast window, one well beyond it.
    await getTripWeather(1, 1, ['2026-08-21', '2026-09-10']);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map((c) => c[0] as string);
    expect(urls.some((u) => u.includes('api.open-meteo.com/v1/forecast'))).toBe(
      true,
    );
    expect(urls.some((u) => u.includes('archive-api.open-meteo.com'))).toBe(
      true,
    );
  });

  it('returns an empty Map (never throws) on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    const result = await getTripWeather(1, 1, ['2026-08-22']);
    expect(result.size).toBe(0);
  });

  it('returns an empty Map (never throws) on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    const result = await getTripWeather(1, 1, ['2026-08-22']);
    expect(result.size).toBe(0);
  });

  it('returns an empty Map (never throws) on a malformed body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({})));
    const result = await getTripWeather(1, 1, ['2026-08-22']);
    expect(result.size).toBe(0);
  });

  it('maps WMO codes to labels, including an unknown code falling back to a neutral label', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          daily: {
            time: ['2026-08-20', '2026-08-21', '2026-08-22', '2026-08-23'],
            weather_code: [0, 45, 4, 99],
            temperature_2m_max: [30, 30, 30, 30],
            temperature_2m_min: [25, 25, 25, 25],
            precipitation_probability_max: [0, 0, 0, 0],
          },
        }),
      ),
    );

    const result = await getTripWeather(1, 1, [
      '2026-08-20',
      '2026-08-21',
      '2026-08-22',
      '2026-08-23',
    ]);

    expect(result.get('2026-08-20')?.label).toBe('Clear sky');
    expect(result.get('2026-08-21')?.label).toBe('Fog');
    expect(result.get('2026-08-22')?.label).toBe('Unknown conditions');
    expect(result.get('2026-08-23')?.label).toBe('Thunderstorm');
  });

  it('caches results, so the same lookup twice issues one set of requests', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        daily: {
          time: ['2026-08-20', '2026-08-21', '2026-08-22'],
          weather_code: [3, 3, 3],
          temperature_2m_max: [29, 29, 29],
          temperature_2m_min: [25, 25, 25],
          precipitation_probability_max: [10, 10, 10],
        },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const first = await getTripWeather(1, 1, ['2026-08-22']);
    const second = await getTripWeather(1, 1, ['2026-08-22']);

    expect(second.get('2026-08-22')).toEqual(first.get('2026-08-22'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
