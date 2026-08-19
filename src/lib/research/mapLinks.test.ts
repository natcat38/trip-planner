import { describe, expect, it } from 'vitest';
import { appleMapsTransitUrl, googleMapsTransitUrl } from './mapLinks';

// Kyoto Station -> Kinkaku-ji: real route where Transitous returns zero itineraries
// (Kinkaku-ji is bus-only, Kyoto City Bus isn't in the feed) — the case these links exist for.
const kyotoStation = { lat: 35.0116, lng: 135.7681 };
const kinkakuji = { lat: 35.0394, lng: 135.7292 };

// Lisbon: negative longitude, to catch a sign lost to bad encoding.
const lisbon = { lat: 38.7223, lng: -9.1366 };
const belem = { lat: 38.6975, lng: -9.2062 };

describe('googleMapsTransitUrl', () => {
  it('has the documented host, path and required params', () => {
    const url = new URL(googleMapsTransitUrl(kyotoStation, kinkakuji));
    expect(url.host).toBe('www.google.com');
    expect(url.pathname).toBe('/maps/dir/');
    expect(url.searchParams.get('api')).toBe('1');
    expect(url.searchParams.get('travelmode')).toBe('transit');
  });

  it('places coordinates in lat,lng order', () => {
    const url = new URL(googleMapsTransitUrl(kyotoStation, kinkakuji));
    expect(url.searchParams.get('origin')).toBe('35.0116,135.7681');
    expect(url.searchParams.get('destination')).toBe('35.0394,135.7292');
  });

  it('preserves negative longitudes', () => {
    const url = new URL(googleMapsTransitUrl(lisbon, belem));
    expect(url.searchParams.get('origin')).toBe('38.7223,-9.1366');
    expect(url.searchParams.get('destination')).toBe('38.6975,-9.2062');
  });

  it('URL-encodes an optional destination label, including non-ASCII', () => {
    const url = new URL(
      googleMapsTransitUrl(kyotoStation, kinkakuji, '金閣寺 Temple'),
    );
    const destination = url.searchParams.get('destination')!;
    expect(destination).toBe('35.0394,135.7292 (金閣寺 Temple)');
    // the raw querystring itself must not contain a literal space or the raw label
    expect(url.search).not.toContain(' ');
    expect(url.search).not.toContain('金閣寺 Temple');
  });

  it('works with coordinates only, no label', () => {
    const url = new URL(googleMapsTransitUrl(kyotoStation, kinkakuji));
    expect(url.searchParams.get('destination')).toBe('35.0394,135.7292');
  });
});

describe('appleMapsTransitUrl', () => {
  it('has the documented host and required params', () => {
    const url = new URL(appleMapsTransitUrl(kyotoStation, kinkakuji));
    expect(url.host).toBe('maps.apple.com');
    expect(url.searchParams.get('dirflg')).toBe('r');
  });

  it('places coordinates in lat,lng order', () => {
    const url = new URL(appleMapsTransitUrl(kyotoStation, kinkakuji));
    expect(url.searchParams.get('saddr')).toBe('35.0116,135.7681');
    expect(url.searchParams.get('daddr')).toBe('35.0394,135.7292');
  });

  it('preserves negative longitudes', () => {
    const url = new URL(appleMapsTransitUrl(lisbon, belem));
    expect(url.searchParams.get('saddr')).toBe('38.7223,-9.1366');
    expect(url.searchParams.get('daddr')).toBe('38.6975,-9.2062');
  });

  it('URL-encodes an optional destination label, including non-ASCII', () => {
    const url = new URL(
      appleMapsTransitUrl(kyotoStation, kinkakuji, '金閣寺 Temple'),
    );
    const destination = url.searchParams.get('daddr')!;
    expect(destination).toBe('35.0394,135.7292 (金閣寺 Temple)');
    expect(url.search).not.toContain(' ');
    expect(url.search).not.toContain('金閣寺 Temple');
  });

  it('works with coordinates only, no label', () => {
    const url = new URL(appleMapsTransitUrl(kyotoStation, kinkakuji));
    expect(url.searchParams.get('daddr')).toBe('35.0394,135.7292');
  });
});
