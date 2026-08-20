import { describe, expect, it } from 'vitest';
import { buildCandidates, type PlanInput } from './algorithmic';

// Real-ish Fukuoka coordinates across three distinct, walkable pockets of the city, far enough
// apart to land in separate proximity clusters (CLUSTER_RADIUS_DEG is ~0.01deg / ~1km).
const TENJIN = [
  {
    id: 'tenjin-1',
    name: 'Ichiran Ramen Tenjin',
    lat: 33.5904,
    lng: 130.4017,
    category: 'Food',
  },
  {
    id: 'tenjin-2',
    name: 'Hakata Gyoza Bar',
    lat: 33.591,
    lng: 130.402,
    category: 'Food',
  },
  {
    id: 'tenjin-3',
    name: 'Tenjin Central Park',
    lat: 33.5898,
    lng: 130.4005,
    category: 'Sightseeing',
  },
  {
    id: 'tenjin-4',
    name: 'Solaria Plaza Food Hall',
    lat: 33.592,
    lng: 130.403,
    category: 'Food',
  },
];
const DAZAIFU = [
  {
    id: 'dazaifu-1',
    name: 'Dazaifu Tenmangu',
    lat: 33.5194,
    lng: 130.5352,
    category: 'Sightseeing',
  },
  {
    id: 'dazaifu-2',
    name: 'Umegae Mochi Shop',
    lat: 33.52,
    lng: 130.536,
    category: 'Food',
  },
  {
    id: 'dazaifu-3',
    name: 'Kyushu National Museum',
    lat: 33.5205,
    lng: 130.5345,
    category: 'Sightseeing',
  },
];
const MOMOCHI = [
  {
    id: 'momochi-1',
    name: 'Fukuoka Tower',
    lat: 33.5933,
    lng: 130.3512,
    category: 'Sightseeing',
  },
  {
    id: 'momochi-2',
    name: 'Momochi Seaside Cafe',
    lat: 33.594,
    lng: 130.352,
    category: 'Food',
  },
  {
    id: 'momochi-3',
    name: 'Fukuoka Marine World',
    lat: 33.5928,
    lng: 130.3505,
    category: 'Sightseeing',
  },
];
const FUKUOKA_POOL = [...TENJIN, ...DAZAIFU, ...MOMOCHI];

function basePlanInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return { places: FUKUOKA_POOL, pace: 'relaxed', focus: [], ...overrides };
}

describe('buildCandidates', () => {
  it('returns 2-3 candidates for a realistic pool', () => {
    const candidates = buildCandidates(basePlanInput());
    expect(candidates.length).toBeGreaterThanOrEqual(2);
    expect(candidates.length).toBeLessThanOrEqual(3);
  });

  it('grounds every returned id in the input pool', () => {
    const validIds = new Set(FUKUOKA_POOL.map((p) => p.id));
    const candidates = buildCandidates(basePlanInput());

    expect(candidates.length).toBeGreaterThan(0);
    for (const candidate of candidates) {
      expect(candidate.placeIds.length).toBeGreaterThan(0);
      for (const id of candidate.placeIds) {
        expect(validIds.has(id)).toBe(true);
      }
    }
  });

  it('orders proximity-sensibly: two tight clusters far apart are not interleaved', () => {
    const twoClusterPool = [...TENJIN, ...DAZAIFU];
    const tenjinIds = new Set(TENJIN.map((p) => p.id));
    const candidates = buildCandidates({
      places: twoClusterPool,
      pace: 'relaxed',
      focus: [],
    });

    for (const candidate of candidates) {
      const labels = candidate.placeIds.map((id) =>
        tenjinIds.has(id) ? 'A' : 'B',
      );
      // Count transitions between cluster labels. A non-alternating route visits one cluster's
      // stops as a contiguous block before crossing to the other, so there is at most one
      // transition (all A then all B, or all B then all A) rather than a zig-zag (>1).
      let transitions = 0;
      for (let i = 1; i < labels.length; i++) {
        if (labels[i] !== labels[i - 1]) transitions++;
      }
      expect(transitions).toBeLessThanOrEqual(1);
    }
  });

  it('gives packed more places per plan than relaxed on the same pool', () => {
    const relaxed = buildCandidates(basePlanInput({ pace: 'relaxed' }));
    const packed = buildCandidates(basePlanInput({ pace: 'packed' }));

    expect(packed[0].placeIds.length).toBeGreaterThan(
      relaxed[0].placeIds.length,
    );
  });

  it('shifts the mix toward requested focus categories', () => {
    const categoryOf = new Map(FUKUOKA_POOL.map((p) => [p.id, p.category]));
    const countFocusHits = (candidates: ReturnType<typeof buildCandidates>) =>
      candidates.reduce(
        (sum, c) =>
          sum + c.placeIds.filter((id) => categoryOf.get(id) === 'Food').length,
        0,
      );

    const unfocused = buildCandidates(basePlanInput({ focus: [] }));
    const foodFocused = buildCandidates(basePlanInput({ focus: ['Food'] }));

    expect(countFocusHits(foodFocused)).toBeGreaterThan(
      countFocusHits(unfocused),
    );
  });

  it('does not filter out every non-focus place even when focus dominates the pool', () => {
    const candidates = buildCandidates(basePlanInput({ focus: ['Food'] }));
    const categoryOf = new Map(FUKUOKA_POOL.map((p) => [p.id, p.category]));

    for (const candidate of candidates) {
      const categories = new Set(
        candidate.placeIds.map((id) => categoryOf.get(id)),
      );
      if (candidate.placeIds.length > 1) {
        expect(categories.size).toBeGreaterThan(1);
      }
    }
  });

  it('produces candidates that differ from one another', () => {
    const candidates = buildCandidates(basePlanInput());
    const signatures = candidates.map((c) => [...c.placeIds].sort().join(','));
    expect(new Set(signatures).size).toBe(candidates.length);
  });

  it('returns [] for an empty pool, never throwing', () => {
    expect(buildCandidates(basePlanInput({ places: [] }))).toEqual([]);
  });

  it('returns one short candidate for a single place', () => {
    const onePlace = [TENJIN[0]];
    const candidates = buildCandidates(basePlanInput({ places: onePlace }));

    expect(candidates).toHaveLength(1);
    expect(candidates[0].placeIds).toEqual([onePlace[0].id]);
  });

  it('returns one short candidate for two places, never throwing', () => {
    const twoPlaces = [TENJIN[0], DAZAIFU[0]];
    const candidates = buildCandidates(basePlanInput({ places: twoPlaces }));

    expect(candidates).toHaveLength(1);
    expect(new Set(candidates[0].placeIds)).toEqual(
      new Set(twoPlaces.map((p) => p.id)),
    );
  });

  it('never throws on an unmatched focus category', () => {
    expect(() =>
      buildCandidates(basePlanInput({ focus: ['Nightlife'] })),
    ).not.toThrow();
  });

  it('is deterministic: identical input yields identical output', () => {
    const first = buildCandidates(basePlanInput());
    const second = buildCandidates(basePlanInput());
    expect(second).toEqual(first);
  });
});
