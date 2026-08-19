import { afterEach, describe, expect, it, vi } from 'vitest';
import { nearestStation, searchPlaces } from './overpass';

function jsonResponse(body: unknown, ok = true) {
  return { ok, json: () => Promise.resolve(body) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('searchPlaces', () => {
  it('parses OSM tags into OsmPlace, mapping a missing cuisine to null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          elements: [
            {
              type: 'node',
              id: 1234567,
              lat: 33.5904,
              lon: 130.4017,
              tags: {
                name: 'Ichiran Ramen',
                amenity: 'restaurant',
                opening_hours: '24/7',
                website: 'https://ichiran.com',
                phone: '+81 92-000-0000',
              },
            },
          ],
        }),
      ),
    );

    const result = await searchPlaces({
      lat: 33.5904,
      lng: 130.4017,
      radius: 500,
    });

    expect(result).toEqual([
      {
        id: 'node/1234567',
        name: 'Ichiran Ramen',
        lat: 33.5904,
        lng: 130.4017,
        category: 'Food',
        cuisine: null,
        openingHours: '24/7',
        website: 'https://ichiran.com',
        phone: '+81 92-000-0000',
      },
    ]);
  });

  it('reads coordinates from `center` for way/relation elements', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          elements: [
            {
              type: 'way',
              id: 555,
              center: { lat: 35.0, lon: 139.0 },
              tags: { name: 'Some Museum', tourism: 'museum' },
            },
          ],
        }),
      ),
    );

    const result = await searchPlaces({ lat: 35.0, lng: 139.0, radius: 500 });

    expect(result).toEqual([
      expect.objectContaining({
        id: 'way/555',
        lat: 35.0,
        lng: 139.0,
        category: 'Sightseeing',
      }),
    ]);
  });

  it('skips elements with no name or no coordinates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          elements: [
            { type: 'node', id: 1, lat: 1, lon: 1, tags: {} },
            { type: 'node', id: 2, tags: { name: 'No coords' } },
          ],
        }),
      ),
    );

    const result = await searchPlaces({ lat: 1, lng: 1, radius: 500 });
    expect(result).toEqual([]);
  });

  it('returns [] (never throws) when both hosts fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));

    const result = await searchPlaces({ lat: 1, lng: 1, radius: 500 });
    expect(result).toEqual([]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('returns [] (never throws) on a network error from both hosts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network down')),
    );

    const result = await searchPlaces({ lat: 1, lng: 1, radius: 500 });
    expect(result).toEqual([]);
  });

  it('falls through to the mirror host when the primary fails', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('504 from primary'))
      .mockResolvedValueOnce(
        jsonResponse({
          elements: [
            {
              type: 'node',
              id: 9,
              lat: 1,
              lon: 1,
              tags: { name: 'Mirror Place', amenity: 'cafe' },
            },
          ],
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const result = await searchPlaces({ lat: 1, lng: 1, radius: 500 });

    expect(result).toEqual([
      expect.objectContaining({ id: 'node/9', name: 'Mirror Place' }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('overpass-api.de');
    expect(fetchMock.mock.calls[1][0]).toContain('overpass.kumi.systems');
  });

  it('handles a timeout/abort cleanly, returning []', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(() => {
        const err = new DOMException('The operation was aborted', 'AbortError');
        return Promise.reject(err);
      }),
    );

    const result = await searchPlaces({ lat: 1, lng: 1, radius: 500 });
    expect(result).toEqual([]);
  });

  it('maps categories: Food, Sightseeing, and an unrecognised tag falling through to Other', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          elements: [
            {
              type: 'node',
              id: 1,
              lat: 1,
              lon: 1,
              tags: { name: 'Cafe', amenity: 'cafe' },
            },
            {
              type: 'node',
              id: 2,
              lat: 1,
              lon: 1,
              tags: { name: 'Gallery', tourism: 'gallery' },
            },
            {
              type: 'node',
              id: 3,
              lat: 1,
              lon: 1,
              tags: { name: 'Random Shop', shop: 'convenience' },
            },
          ],
        }),
      ),
    );

    const result = await searchPlaces({ lat: 1, lng: 1, radius: 500 });

    expect(result).toEqual([
      expect.objectContaining({ name: 'Cafe', category: 'Food' }),
      expect.objectContaining({ name: 'Gallery', category: 'Sightseeing' }),
      expect.objectContaining({ name: 'Random Shop', category: 'Other' }),
    ]);
  });

  it('falls back to name:en / name:ja-Latn when an element has no plain name', async () => {
    // Central Fukuoka's bus stops really are tagged this way; requiring a plain
    // `name` made nearestStation return nothing in the middle of the city.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          elements: [
            {
              type: 'node',
              id: 1,
              lat: 1,
              lon: 1,
              tags: { 'name:ja-Latn': 'Yakuin ohdori', highway: 'bus_stop' },
            },
            {
              type: 'node',
              id: 2,
              lat: 1,
              lon: 1,
              tags: { 'name:en': 'Hakata Station', railway: 'station' },
            },
            { type: 'node', id: 3, lat: 1, lon: 1, tags: { railway: 'stop' } },
          ],
        }),
      ),
    );

    const result = await searchPlaces({ lat: 1, lng: 1, radius: 500 });

    expect(result.map((p) => p.name)).toEqual([
      'Yakuin ohdori',
      'Hakata Station',
    ]);
  });

  it('escapes regex metacharacters in the search term so it stays a literal search', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ elements: [] }));
    vi.stubGlobal('fetch', fetchMock);

    await searchPlaces({
      lat: 1,
      lng: 1,
      radius: 500,
      query: 'café (old town)',
    });

    const body = fetchMock.mock.calls[0][1].body as string;
    // Doubled backslashes: QL unescapes the string literal before the regex engine sees it,
    // so `\\(` on the wire is a literal `(` to the matcher.
    expect(body).toContain('["name"~"café \\\\(old town\\\\)",i]');
  });
});

describe('nearestStation', () => {
  it('returns the closest station/bus stop by distance', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          elements: [
            {
              type: 'node',
              id: 1,
              lat: 35.01,
              lon: 139.01,
              tags: { name: 'Far Station', railway: 'station' },
            },
            {
              type: 'node',
              id: 2,
              lat: 35.001,
              lon: 139.001,
              tags: { name: 'Near Station', railway: 'station' },
            },
          ],
        }),
      ),
    );

    const result = await nearestStation(35.0, 139.0);
    expect(result).toEqual(expect.objectContaining({ name: 'Near Station' }));
  });

  it('returns null (never throws) when both hosts fail', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    expect(await nearestStation(35.0, 139.0)).toBeNull();
  });

  it('returns null when no station or bus stop is found nearby', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ elements: [] })),
    );
    expect(await nearestStation(35.0, 139.0)).toBeNull();
  });
});
