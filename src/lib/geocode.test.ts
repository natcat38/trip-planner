import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geocode } from './geocode';

beforeEach(() => {
  process.env.MAPBOX_TOKEN = 'test-token';
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
});
