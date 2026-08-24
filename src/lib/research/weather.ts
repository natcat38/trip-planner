// Open-Meteo weather for a trip's days. Server-only, never throws — same
// fallback philosophy as ./overpass.ts / ./wikivoyage.ts / ../geocode.ts.
//
// Degrade-honestly rule (ADR-0008, applied here to weather rather than
// guide prose): Open-Meteo's forecast only reaches 16 days out
// (`forecast_days` allows 0-16), and most trip planning happens further
// ahead than that — "no forecast available" is the COMMON case, not an
// edge case. Rather than show nothing for those days, a date beyond the
// forecast window is answered with the SAME calendar date one year earlier
// from the archive API, tagged `kind: 'historical'`. That reading must
// NEVER be presented as a forecast — `kind` is the discriminator the UI
// renders off, exactly like Wikivoyage's `coverage` indicator.

import { createTtlCache } from '../ttl-cache';
import { USER_AGENT } from './userAgent';

const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast';
const ARCHIVE_URL = 'https://archive-api.open-meteo.com/v1/archive';
const REQUEST_TIMEOUT_MS = 10_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // mirrors fx.ts's daily refresh
// Open-Meteo's own limit: `forecast_days=17` returns HTTP 400 ("Allowed
// range 0 to 16"). 16 days starting today means the last in-window offset
// is 15.
const FORECAST_MAX_DAYS = 16;

export type DayWeatherKind = 'forecast' | 'historical';

export interface DayWeather {
  date: string; // YYYY-MM-DD
  kind: DayWeatherKind;
  maxC: number;
  minC: number;
  precipitationChance: number | null; // % — forecast only
  precipitationMm: number | null; // mm — historical only
  code: number; // WMO code
  label: string; // human text for the WMO code
}

// WMO weather code -> human label. Unknown codes (nothing in the API's own
// vocabulary falls outside these bands, but a malformed response could)
// fall back to a neutral string, never `undefined`.
const WMO_LABELS: { min: number; max: number; label: string }[] = [
  { min: 0, max: 0, label: 'Clear sky' },
  { min: 1, max: 3, label: 'Partly cloudy' },
  { min: 45, max: 48, label: 'Fog' },
  { min: 51, max: 57, label: 'Drizzle' },
  { min: 61, max: 67, label: 'Rain' },
  { min: 71, max: 77, label: 'Snow' },
  { min: 80, max: 82, label: 'Rain showers' },
  { min: 85, max: 86, label: 'Snow showers' },
  { min: 95, max: 99, label: 'Thunderstorm' },
];

function weatherLabel(code: number): string {
  return (
    WMO_LABELS.find((r) => code >= r.min && code <= r.max)?.label ??
    'Unknown conditions'
  );
}

// ponytail: plain Map with a size cap, not an LRU — same rationale as
// ../geocode.ts. Keys are lat/lng/date triples for every trip ever viewed
// on a long-lived server, so an uncapped Map would grow without bound.
const MAX_ENTRIES = 2000;

const cache = createTtlCache<DayWeather>(CACHE_TTL_MS, MAX_ENTRIES);

export function __resetWeatherCacheForTests() {
  cache.reset();
}

function cacheKey(lat: number, lng: number, date: string): string {
  return `${lat},${lng}|${date}`;
}

function setCache(lat: number, lng: number, weather: DayWeather) {
  cache.set(cacheKey(lat, lng, weather.date), weather);
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      MS_PER_DAY,
  );
}

// Same calendar date, one year earlier — the historical fallback's source
// date. UTC throughout so this can't drift a day either side of midnight.
function yearBefore(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() - 1);
  return d.toISOString().slice(0, 10);
}

interface OpenMeteoDaily {
  time?: string[];
  weather_code?: number[];
  temperature_2m_max?: number[];
  temperature_2m_min?: number[];
  precipitation_probability_max?: (number | null)[];
  precipitation_sum?: (number | null)[];
}

interface OpenMeteoResponse {
  daily?: OpenMeteoDaily;
}

async function fetchDaily(url: string): Promise<OpenMeteoDaily | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as OpenMeteoResponse;
    return data.daily ?? null;
  } catch {
    return null;
  }
}

// One request covering every requested forecast date, using `forecast_days`
// sized to reach the furthest one — Open-Meteo has no start_date param for
// this endpoint, it always starts from today.
async function fetchForecast(
  lat: number,
  lng: number,
  dates: string[],
): Promise<Map<string, DayWeather>> {
  const out = new Map<string, DayWeather>();
  const today = todayDateString();
  const maxOffset = Math.max(...dates.map((d) => daysBetween(today, d)));
  const forecastDays = Math.min(FORECAST_MAX_DAYS, maxOffset + 1);

  const url =
    `${FORECAST_URL}?latitude=${lat}&longitude=${lng}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max` +
    `&timezone=auto&forecast_days=${forecastDays}`;

  const daily = await fetchDaily(url);
  if (!daily?.time) return out;

  const wanted = new Set(dates);
  for (let i = 0; i < daily.time.length; i++) {
    const date = daily.time[i];
    if (!wanted.has(date)) continue;
    const code = daily.weather_code?.[i];
    const maxC = daily.temperature_2m_max?.[i];
    const minC = daily.temperature_2m_min?.[i];
    if (code == null || maxC == null || minC == null) continue;
    out.set(date, {
      date,
      kind: 'forecast',
      maxC,
      minC,
      precipitationChance: daily.precipitation_probability_max?.[i] ?? null,
      precipitationMm: null,
      code,
      label: weatherLabel(code),
    });
  }
  return out;
}

// One request covering every requested historical date, shifted a year
// back and spanned start_date..end_date (the archive endpoint does support
// a range, unlike forecast). Dates the archive still can't answer (too
// recent, or the host is down) are simply absent from the result — callers
// render nothing for that day.
async function fetchHistorical(
  lat: number,
  lng: number,
  dates: string[],
): Promise<Map<string, DayWeather>> {
  const out = new Map<string, DayWeather>();
  const shiftedToOriginal = new Map<string, string>();
  for (const date of dates) shiftedToOriginal.set(yearBefore(date), date);
  const shiftedDates = Array.from(shiftedToOriginal.keys()).sort();
  const startDate = shiftedDates[0];
  const endDate = shiftedDates[shiftedDates.length - 1];

  const url =
    `${ARCHIVE_URL}?latitude=${lat}&longitude=${lng}` +
    `&start_date=${startDate}&end_date=${endDate}` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum` +
    `&timezone=auto`;

  const daily = await fetchDaily(url);
  if (!daily?.time) return out;

  for (let i = 0; i < daily.time.length; i++) {
    const shiftedDate = daily.time[i];
    const date = shiftedToOriginal.get(shiftedDate);
    if (!date) continue;
    const code = daily.weather_code?.[i];
    const maxC = daily.temperature_2m_max?.[i];
    const minC = daily.temperature_2m_min?.[i];
    if (code == null || maxC == null || minC == null) continue;
    out.set(date, {
      date,
      kind: 'historical',
      maxC,
      minC,
      precipitationChance: null,
      precipitationMm: daily.precipitation_sum?.[i] ?? null,
      code,
      label: weatherLabel(code),
    });
  }
  return out;
}

// Server-side only. Never throws: a bad coordinate, a slow host, or both
// endpoints being down leaves the day silently un-weathered rather than
// breaking the page. Batches every date into at most two requests total —
// one forecast call, one archive call — never one request per day.
export async function getTripWeather(
  lat: number,
  lng: number,
  dates: string[],
): Promise<Map<string, DayWeather>> {
  const result = new Map<string, DayWeather>();

  try {
    const uniqueDates = Array.from(new Set(dates));
    const toFetch: string[] = [];

    for (const date of uniqueDates) {
      const cached = cache.get(cacheKey(lat, lng, date));
      if (cached) {
        result.set(date, cached);
      } else {
        toFetch.push(date);
      }
    }
    if (toFetch.length === 0) return result;

    const today = todayDateString();
    const forecastDates = toFetch.filter((d) => {
      const offset = daysBetween(today, d);
      return offset >= 0 && offset < FORECAST_MAX_DAYS;
    });
    const historicalDates = toFetch.filter((d) => !forecastDates.includes(d));

    if (forecastDates.length > 0) {
      const fetched = await fetchForecast(lat, lng, forecastDates);
      for (const weather of fetched.values()) {
        result.set(weather.date, weather);
        setCache(lat, lng, weather);
      }
    }
    if (historicalDates.length > 0) {
      const fetched = await fetchHistorical(lat, lng, historicalDates);
      for (const weather of fetched.values()) {
        result.set(weather.date, weather);
        setCache(lat, lng, weather);
      }
    }
  } catch {
    // Never throw — return whatever was resolved so far.
  }

  return result;
}
