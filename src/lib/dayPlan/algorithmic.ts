/**
 * Algorithmic day-plan candidate generation — the keyless path for Phase 3 M4. Produces 2–3
 * candidate day plans from a pool of real places with no network call, no database, and no
 * external dependency: proximity clustering + a nearest-neighbour route, biased by the
 * requester's stated pace and focus. This is the same route-optimisation math Wanderlog
 * paywalls (knowledge/domain/day-generation.md) — a first-class feature, not
 * a fallback of last resort. A parallel AI path (src/lib/ai/*) covers users with a BYOK key;
 * this module exists so a keyless user is never locked out.
 *
 * Grounding rule (ADR-0008) holds here too: every place id returned traces back to
 * `input.places`. Nothing is invented, and nothing is scored away entirely.
 * @packageDocumentation
 */

export interface PlanCandidate {
  label: string;
  placeIds: string[];
}

interface PlanPlace {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category: string;
}

export interface PlanInput {
  places: PlanPlace[];
  pace: 'relaxed' | 'packed';
  focus: string[]; // e.g. ['Food', 'Sightseeing'] — matches Activity.category vocabulary
}

// Concrete stop counts per pace, named per the M4 task's "pick concrete numbers, name them as
// constants" instruction. Relaxed favours a leisurely day; packed favours seeing more. Tuned
// for city-day scale by judgment, not derived from data — revisit if real usage disagrees.
const RELAXED_STOPS = 4;
const PACKED_STOPS = 7;

// At most this share of a plan's stops may come from the requested focus categories. Focus
// should bias selection, not filter everything else out — a day of only "Food" stops is
// usually a worse plan than one with a ramen stop and a temple stop, even when the pool is
// stacked with restaurants. 0.7 is a deliberately loose cap: focus still visibly dominates the
// plan, it just isn't the only thing in it.
const FOCUS_SHARE_CAP = 0.7;

// Two places within this many degrees of each other join the same proximity cluster. ~0.01
// degrees is roughly ~1km at these latitudes (see squaredDistance's caveat below) — tuned for
// "walkable vicinity" at city scale, not a precise radius.
const CLUSTER_RADIUS_DEG = 0.01;

const CANDIDATE_LABELS = ['Day Plan A', 'Day Plan B', 'Day Plan C'];
const SINGLE_CANDIDATE_LABEL = 'Day Plan';

// Equirectangular/squared-degree distance — a ranking heuristic, not a true metric. Longitude
// degrees shrink with latitude (a degree of longitude at 35°N is ~18% shorter than at the
// equator), so this must never be read as a real distance or converted to km — it is only ever
// used to compare which of two points is nearer to a third. Same precedent as `nearestStation`
// in ../research/overpass.ts.
function squaredDistance(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  return (a.lat - b.lat) ** 2 + (a.lng - b.lng) ** 2;
}

// Greedy single-linkage clustering: a place joins the first existing cluster with any member
// within CLUSTER_RADIUS_DEG, else it starts a new cluster. This is not k-means/DBSCAN — it's a
// few lines of arithmetic, adequate for grouping "walkable vicinity" without a dependency.
// Sorted largest-first so callers can treat clusters[0] as "the main pocket of places".
function clusterPlaces(places: PlanPlace[]): PlanPlace[][] {
  const clusters: PlanPlace[][] = [];
  for (const place of places) {
    const cluster = clusters.find((c) =>
      c.some((p) => squaredDistance(p, place) <= CLUSTER_RADIUS_DEG ** 2),
    );
    if (cluster) cluster.push(place);
    else clusters.push([place]);
  }
  return clusters.sort((a, b) => b.length - a.length);
}

// Nearest-neighbour walk starting from the first place in `places`, greedily hopping to the
// closest unvisited place each step.
//
// ponytail: this is NOT a TSP solver and doesn't try to be one. Greedy nearest-neighbour has a
// known failure mode — a straggler point left for last, forcing one long final hop instead of
// a globally shorter route — that only a real 2-opt/TSP pass fixes. That pass is out of scope
// here per the M4 task's explicit instruction not to implement a real TSP solver. It's adequate
// at day-plan scale (a handful of stops), where the failure mode barely bites.
function orderByProximity(places: PlanPlace[]): PlanPlace[] {
  if (places.length <= 1) return [...places];
  const remaining = [...places];
  const route = [remaining.shift()!];
  while (remaining.length > 0) {
    const current = route[route.length - 1];
    let nearestIndex = 0;
    let nearestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const dist = squaredDistance(current, remaining[i]);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    }
    route.push(remaining.splice(nearestIndex, 1)[0]);
  }
  return route;
}

// Picks up to `slots` places from one cluster, favouring `focus` categories up to
// FOCUS_SHARE_CAP and filling the rest from whatever else the cluster has. When `focus` is
// empty every place counts as a "match", so this just takes the cluster in input order.
function selectFromCluster(
  places: PlanPlace[],
  focus: Set<string>,
  slots: number,
): PlanPlace[] {
  if (slots <= 0) return [];
  const isMatch = (p: PlanPlace) => focus.size === 0 || focus.has(p.category);
  const matches = places.filter(isMatch);
  const others = places.filter((p) => !isMatch(p));

  const focusSlots = Math.min(
    matches.length,
    Math.ceil(slots * FOCUS_SHARE_CAP),
  );
  const picked = matches.slice(0, focusSlots);
  picked.push(...others.slice(0, slots - picked.length));

  // Not enough non-focus places to fill the rest of the plan (or there's no focus at all, so
  // `others` was empty from the start) — backfill with leftover focus matches instead of
  // returning a plan shorter than it needs to be.
  const stillShort = slots - picked.length;
  if (stillShort > 0) {
    picked.push(...matches.slice(focusSlots, focusSlots + stillShort));
  }
  return picked.slice(0, slots);
}

function selectStops(
  clusterOrder: PlanPlace[][],
  focus: Set<string>,
  stopsPerPlan: number,
): PlanPlace[] {
  const selected: PlanPlace[] = [];
  for (const cluster of clusterOrder) {
    if (selected.length >= stopsPerPlan) break;
    selected.push(
      ...selectFromCluster(cluster, focus, stopsPerPlan - selected.length),
    );
  }
  return selected;
}

// Three ways to prioritise the same clusters, so different candidates draw from a different
// part of the map first when the pool is big enough for that to matter. With a single cluster
// all three are identical; buildCandidates' dedupe collapses that down to one candidate rather
// than padding with three orderings of the same places.
function clusterOrderVariants(clusters: PlanPlace[][]): PlanPlace[][][] {
  const rotated = [...clusters.slice(1), ...clusters.slice(0, 1)];
  const reversed = [...clusters].reverse();
  return [clusters, rotated, reversed];
}

export function buildCandidates(input: PlanInput): PlanCandidate[] {
  const { places, pace, focus } = input;
  if (places.length === 0) return [];

  // Too small a pool to make "meaningfully different" candidates meaningful — one short
  // candidate covering everything is the honest answer, not three copies of the same 1-2 stops.
  if (places.length <= 2) {
    return [
      {
        label: SINGLE_CANDIDATE_LABEL,
        placeIds: orderByProximity(places).map((p) => p.id),
      },
    ];
  }

  const stopsPerPlan = pace === 'packed' ? PACKED_STOPS : RELAXED_STOPS;
  const focusSet = new Set(focus);
  const clusters = clusterPlaces(places);

  const candidates: PlanCandidate[] = [];
  const seenStopSets = new Set<string>();
  for (const clusterOrder of clusterOrderVariants(clusters)) {
    if (candidates.length >= 3) break;
    const stops = selectStops(clusterOrder, focusSet, stopsPerPlan);
    if (stops.length === 0) continue;
    const ordered = orderByProximity(stops);

    // Same underlying set of stops as an earlier candidate, regardless of route order, is not
    // "meaningfully different" — skip it rather than padding to 3 with a near-duplicate.
    const signature = ordered
      .map((p) => p.id)
      .sort()
      .join(',');
    if (seenStopSets.has(signature)) continue;
    seenStopSets.add(signature);

    candidates.push({
      label: CANDIDATE_LABELS[candidates.length],
      placeIds: ordered.map((p) => p.id),
    });
  }
  return candidates;
}
