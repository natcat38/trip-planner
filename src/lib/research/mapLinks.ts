/**
 * Google/Apple Maps transit deep links — the free fallback when Transitous returns zero
 * itineraries (e.g. bus-only routes it doesn't cover) or is rate-limited. No key, no quota,
 * no ToS agreement, so these are permanent secondary actions, not just an error state
 * (docs/phase-3-research-layer-handoff.md §3.8).
 */

export interface LatLng {
  lat: number;
  lng: number;
}

function coordString({ lat, lng }: LatLng): string {
  return `${lat},${lng}`;
}

export function googleMapsTransitUrl(
  from: LatLng,
  to: LatLng,
  destinationLabel?: string,
): string {
  const params = new URLSearchParams({
    api: '1',
    origin: coordString(from),
    destination: destinationLabel
      ? `${coordString(to)} (${destinationLabel})`
      : coordString(to),
    travelmode: 'transit',
  });
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function appleMapsTransitUrl(
  from: LatLng,
  to: LatLng,
  destinationLabel?: string,
): string {
  const params = new URLSearchParams({
    saddr: coordString(from),
    daddr: destinationLabel
      ? `${coordString(to)} (${destinationLabel})`
      : coordString(to),
    dirflg: 'r',
  });
  return `https://maps.apple.com/?${params.toString()}`;
}
