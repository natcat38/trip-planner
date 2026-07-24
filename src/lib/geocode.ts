import { requireEnv } from './env';

export interface GeocodeResult {
  lat: number;
  lng: number;
}

// Server-side only — the token never reaches the browser. Never throws: a bad
// address or a Mapbox outage shouldn't block saving the activity, just leave
// it without a pin (same fallback philosophy as ../lib/fx.ts's convertMinor).
export async function geocode(placeName: string): Promise<GeocodeResult | null> {
  try {
    const url = `https://api.mapbox.com/search/geocode/v6/forward?q=${encodeURIComponent(placeName)}&access_token=${requireEnv('MAPBOX_TOKEN')}&limit=1`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const data = await res.json();
    const coordinates = data.features?.[0]?.properties?.coordinates;
    if (!coordinates) return null;

    return { lat: coordinates.latitude, lng: coordinates.longitude };
  } catch {
    return null;
  }
}
