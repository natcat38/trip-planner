import { requireEnv } from './env';
import { minorUnitExponent, toMinorUnits } from './money';
import { createTtlCache } from './ttl-cache';

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // daily refresh per ADR-0004
const cache = createTtlCache<Record<string, number>>(CACHE_TTL_MS);

export function __resetFxCacheForTests() {
  cache.reset();
}

async function fetchRates(
  base: string,
): Promise<Record<string, number> | null> {
  const res = await fetch(
    `https://v6.exchangerate-api.com/v6/${requireEnv('EXCHANGE_RATE_API_KEY')}/latest/${base}`,
  );
  if (!res.ok) return null;
  const data = await res.json();
  if (data.result !== 'success') return null;
  return data.conversion_rates;
}

async function getRates(base: string): Promise<Record<string, number> | null> {
  const cached = cache.get(base);
  if (cached) return cached;

  const rates = await fetchRates(base);
  if (!rates) return null;
  cache.set(base, rates);
  return rates;
}

// Converts a cost from its original currency into a trip's base currency, in minor units.
// Returns null (never throws) when no rate is available — per Tech Scope §2.3, callers
// should show the original amount and retry on next refresh rather than blocking the UI.
export async function convertMinor(
  amountMinor: number,
  from: string,
  to: string,
): Promise<number | null> {
  if (from === to) return amountMinor;

  try {
    const rates = await getRates(from);
    const rate = rates?.[to];
    if (rate == null) return null;
    const amount = amountMinor / 10 ** minorUnitExponent(from);
    return toMinorUnits(amount * rate, to);
  } catch {
    return null;
  }
}
