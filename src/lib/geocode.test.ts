import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetGeocodeCacheForTests, geocode } from './geocode';

beforeEach(() => {
  process.env.MAPBOX_TOKEN = 'test-token';
  // Several tests below geocode the same name; without this they'd read each
  // other's cached results instead of exercising their own stubbed fetch.
  __resetGeocodeCacheForTests();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('geocode', () => {
  it('returns lat/lng from the first matching feature', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            features: [
              {
                properties: {
                  name: 'Tokyo Tower',
                  coordinates: { longitude: 139.7454, latitude: 35.6586 },
                },
              },
            ],
          }),
      }),
    );

    const result = await geocode('Tokyo Tower');

    expect(result).toEqual({ lat: 35.6586, lng: 139.7454 });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        'https://api.mapbox.com/search/geocode/v6/forward?q=Tokyo%20Tower',
      ),
    );
  });

  it('returns null when there are no matching features', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ features: [] }),
      }),
    );
    expect(await geocode('asdkjfhaslkdjfh')).toBeNull();
  });

  it('returns null (not throw) when the HTTP request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await geocode('Tokyo Tower')).toBeNull();
  });

  it('returns null (not throw) on a network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );
    expect(await geocode('Tokyo Tower')).toBeNull();
  });

  it('caches a hit, so repeating the same lookup makes one request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            {
              properties: { coordinates: { longitude: 139.7, latitude: 35.6 } },
            },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const first = await geocode('Tokyo Tower');
    // Same place, different casing/padding — it's the same lookup.
    const second = await geocode('  tokyo tower  ');

    expect(second).toEqual(first);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not cache a failure, so a later attempt can still succeed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await geocode('Tokyo Tower')).toBeNull();

    // One Mapbox blip must not pin the place to "no coordinates" for a day.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            features: [
              {
                properties: {
                  coordinates: { longitude: 139.7, latitude: 35.6 },
                },
              },
            ],
          }),
      }),
    );

    expect(await geocode('Tokyo Tower')).toEqual({ lat: 35.6, lng: 139.7 });
  });

  it('evicts the oldest entry once the cache is full', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            { properties: { coordinates: { longitude: 1, latitude: 2 } } },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);

    // MAX_ENTRIES is 500; 'place-0' is the oldest, so filling past the cap
    // should drop it while a recent entry stays warm.
    for (let i = 0; i < 500; i++) await geocode(`place-${i}`);
    expect(fetchMock).toHaveBeenCalledTimes(500);

    await geocode('one-too-many');
    fetchMock.mockClear();

    await geocode('place-499'); // still cached — no request
    expect(fetchMock).not.toHaveBeenCalled();

    await geocode('place-0'); // evicted — refetched
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('serves a cached hit without needing the API token again', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          features: [
            { properties: { coordinates: { longitude: 2.3, latitude: 48.8 } } },
          ],
        }),
    });
    vi.stubGlobal('fetch', fetchMock);
    await geocode('Paris');

    // requireEnv throws when MAPBOX_TOKEN is missing; a cache hit returns
    // before that, which is what keeps a warm lookup independent of it.
    delete process.env.MAPBOX_TOKEN;

    expect(await geocode('Paris')).toEqual({ lat: 48.8, lng: 2.3 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
