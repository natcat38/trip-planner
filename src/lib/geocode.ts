import { requireEnv } from './env';
import { createTtlCache } from './ttl-cache';

export interface GeocodeResult {
  lat: number;
  lng: number;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // mirrors ./fx.ts's daily refresh
// ponytail: plain Map with a size cap, not an LRU. Keys are user-supplied place
// names, so an uncapped Map would grow without bound on a long-lived server;
// eviction just drops the oldest insertion (Map preserves insertion order).
// Swap in a real LRU only if hit rates ever suggest the wrong entries are going.
const MAX_ENTRIES = 500;

const cache = createTtlCache<GeocodeResult>(CACHE_TTL_MS, MAX_ENTRIES);

export function __resetGeocodeCacheForTests() {
  cache.reset();
}

// Server-side only — the token never reaches the browser. Never throws: a bad
// address or a Mapbox outage shouldn't block saving the activity, just leave
// it without a pin (same fallback philosophy as ../lib/fx.ts's convertMinor).
//
// Results are cached because a place name resolves to the same coordinates
// every time, and callers re-resolve the same string constantly — the Places
// route geocodes its trip's destination on every single render. Only hits are
// cached: caching a failure would let one Mapbox blip pin a place to "no
// coordinates" for a day, which is exactly the outcome the null-return is
// meant to keep recoverable.
export async function geocode(
  placeName: string,
): Promise<GeocodeResult | null> {
  const key = placeName.trim().toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;

  try {
    const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(placeName)}&access_token=${requireEnv('MAPBOX_TOKEN')}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const coordinates = data.features?.[0]?.properties?.coordinates;
    if (!coordinates) return null;

    const result = { lat: coordinates.latitude, lng: coordinates.longitude };
    cache.set(key, result);
    return result;
  } catch {
    return null;
  }
}
