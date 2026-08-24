/**
 * Free, keyless destination-research data sources — currently OpenStreetMap via the Overpass
 * API. Every module here is server-only and never throws: network or parse failures resolve to
 * `[]`/`null`, matching the fallback philosophy of ../fx.ts and ../geocode.ts. OSM has no price
 * data (verified live — see knowledge/integrations/research-sources.md), so nothing in this
 * directory reads, exposes, or invents a cost field.
 * @packageDocumentation
 */

import { USER_AGENT } from './userAgent';

export interface OsmPlace {
  id: string; // `${type}/${id}`, e.g. "node/1234567"
  name: string;
  lat: number;
  lng: number;
  category: string; // same vocabulary as Activity.category
  cuisine: string | null;
  openingHours: string | null;
  website: string | null;
  phone: string | null;
}

interface SearchParams {
  lat: number;
  lng: number;
  radius: number;
  category?: string;
  query?: string;
}

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const PRIMARY_HOST = 'https://overpass-api.de/api/interpreter';
const MIRROR_HOST = 'https://overpass.kumi.systems/api/interpreter';
const REQUEST_TIMEOUT_MS = 20_000;
const QUERY_TIMEOUT_S = 20;
const MAX_RADIUS_M = 2000;
const MAX_RESULTS = 50;

// Category mapping (see knowledge/integrations/research-sources.md) — same vocabulary as
// Activity.category. Anything not matched below falls through to "Other".
const TAG_CATEGORY_RULES: {
  key: string;
  values: string[];
  category: string;
}[] = [
  {
    key: 'amenity',
    values: ['restaurant', 'cafe', 'fast_food', 'bar'],
    category: 'Food',
  },
  {
    key: 'tourism',
    values: ['museum', 'attraction', 'viewpoint', 'gallery'],
    category: 'Sightseeing',
  },
  { key: 'railway', values: ['station'], category: 'Transport' },
  { key: 'highway', values: ['bus_stop'], category: 'Transport' },
  {
    key: 'tourism',
    values: ['hotel', 'hostel', 'guest_house'],
    category: 'Lodging',
  },
];

function categorize(tags: Record<string, string>): string {
  const rule = TAG_CATEGORY_RULES.find((r) => r.values.includes(tags[r.key]));
  return rule?.category ?? 'Other';
}

// The search term lands in a regex inside a double-quoted Overpass QL string literal. Escape
// regex metacharacters first (so "café (old town)" is a literal search, not a broken regex that
// makes Overpass 400 and silently return nothing), then escape for the string literal itself —
// QL unescapes the string before the regex engine sees it, so this order is the correct one.
function escapeForQl(value: string): string {
  return value
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');
}

function tagFiltersForCategory(category?: string): string[] {
  const rules = category
    ? TAG_CATEGORY_RULES.filter((r) => r.category === category)
    : [];
  return rules.length > 0
    ? rules.map((r) => `["${r.key}"~"^(${r.values.join('|')})$"]`)
    : [''];
}

function buildSearchQuery({
  lat,
  lng,
  radius,
  category,
  query,
}: SearchParams): string {
  const boundedRadius = Math.min(Math.max(radius, 0), MAX_RADIUS_M);
  const nameFilter = query ? `["name"~"${escapeForQl(query)}",i]` : '["name"]';
  const clauses = tagFiltersForCategory(category)
    .map(
      (tagFilter) =>
        `nwr${tagFilter}${nameFilter}(around:${boundedRadius},${lat},${lng});`,
    )
    .join('');
  return `[out:json][timeout:${QUERY_TIMEOUT_S}];(${clauses});out center ${MAX_RESULTS};`;
}

function toPlace(el: OverpassElement): OsmPlace | null {
  const tags = el.tags ?? {};
  // Plenty of Japanese entries carry only a romanised or English name — central
  // Fukuoka's bus stops tag `name:ja-Latn` with no plain `name` — and dropping
  // those left nearestStation returning nothing in the middle of a city.
  const name = tags.name ?? tags['name:en'] ?? tags['name:ja-Latn'];
  const lat = el.lat ?? el.center?.lat;
  const lng = el.lon ?? el.center?.lon;
  if (!name || lat == null || lng == null) return null;

  return {
    id: `${el.type}/${el.id}`,
    name,
    lat,
    lng,
    category: categorize(tags),
    cuisine: tags.cuisine ?? null,
    openingHours: tags.opening_hours ?? null,
    website: tags.website ?? tags['contact:website'] ?? null,
    phone: tags.phone ?? tags['contact:phone'] ?? null,
  };
}

// Tries the primary host, falls through to the mirror on any failure (bad status, network
// error, or timeout) — overpass-api.de returned 504 twice under moderate load during research,
// so the fallback is required, not optional. Returns null only if both hosts fail.
async function runQuery(query: string): Promise<OverpassElement[] | null> {
  for (const host of [PRIMARY_HOST, MIRROR_HOST]) {
    try {
      const res = await fetch(host, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'text/plain',
        },
        body: query,
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) continue;
      const data = await res.json();
      return data.elements ?? [];
    } catch {
      continue;
    }
  }
  return null;
}

// Server-side only. Never throws: a bad bbox, a slow host, or both hosts being down should
// leave the tray empty, not break the page (same fallback philosophy as ../fx.ts / ../geocode.ts).
// Building the query counts as "not breaking the page" too — params come from URL search
// params, so a malformed one must yield no results rather than escape as a TypeError.
export async function searchPlaces(params: SearchParams): Promise<OsmPlace[]> {
  let query: string;
  try {
    query = buildSearchQuery(params);
  } catch {
    return [];
  }

  const elements = await runQuery(query);
  if (!elements) return [];

  const places: OsmPlace[] = [];
  for (const el of elements) {
    const place = toPlace(el);
    if (place) places.push(place);
  }
  return places.slice(0, MAX_RESULTS);
}

function squaredDistance(
  a: { lat: number; lng: number },
  lat: number,
  lng: number,
): number {
  return (a.lat - lat) ** 2 + (a.lng - lng) ** 2;
}

// Partial answer to "how do I get there" — nearest railway station or bus stop, or null if
// none is found nearby or both Overpass hosts fail. Overpass returns elements in id order, not
// distance order, so the cap has to be generous enough that the nearest named stop is inside
// it — a tight cap in a dense city fills up with unnamed platforms and yields nothing.
export async function nearestStation(
  lat: number,
  lng: number,
): Promise<OsmPlace | null> {
  const query = `[out:json][timeout:${QUERY_TIMEOUT_S}];(nwr["railway"="station"](around:1500,${lat},${lng});nwr["highway"="bus_stop"](around:1500,${lat},${lng}););out center ${MAX_RESULTS};`;
  const elements = await runQuery(query);
  if (!elements) return null;

  const places = elements.map(toPlace).filter((p): p is OsmPlace => p !== null);
  if (places.length === 0) return null;

  return places.reduce((closest, p) =>
    squaredDistance(p, lat, lng) < squaredDistance(closest, lat, lng)
      ? p
      : closest,
  );
}
