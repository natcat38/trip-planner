// Shared shape behind every module-level "fetch once, remember for a TTL"
// cache in this codebase (fx.ts, geocode.ts, research/transitous.ts,
// research/weather.ts, research/wikivoyage.ts) — same freshness check, same
// optional size-capped FIFO eviction (a plain Map, not an LRU; see the
// `ponytail:` comments at each call site for why a size cap exists at all),
// same `resetForTests` escape hatch each site re-exports under its own name.

interface TtlCacheEntry<V> {
  value: V;
  fetchedAt: number;
}

export interface TtlCache<V> {
  get(key: string): V | undefined;
  set(key: string, value: V): void;
  has(key: string): boolean;
  reset(): void;
}

export function createTtlCache<V>(
  ttlMs: number,
  maxSize?: number,
): TtlCache<V> {
  let map = new Map<string, TtlCacheEntry<V>>();

  return {
    get(key) {
      const entry = map.get(key);
      if (!entry || Date.now() - entry.fetchedAt >= ttlMs) return undefined;
      return entry.value;
    },
    set(key, value) {
      if (maxSize != null && !map.has(key) && map.size >= maxSize) {
        map.delete(map.keys().next().value!);
      }
      map.set(key, { value, fetchedAt: Date.now() });
    },
    has(key) {
      return map.has(key);
    },
    reset() {
      map = new Map();
    },
  };
}
