/**
 * Guided day-plan generation (Phase 3 M4, ADR-0008/0011, see
 * docs/phase-3-research-layer-handoff.md §8's M4 section): turns a trip's
 * saved places (src/server/places.ts) into 2-3 candidate day plans. Mirrors
 * src/server/guideSummary.ts's shape (auth -> key -> data -> prompt ->
 * friendly errors) with one addition specific to this feature: a keyless or
 * failed AI path never blocks the user, it falls back to the algorithmic
 * candidates from src/lib/dayPlan/algorithmic.ts instead.
 *
 * The grounding rule (ADR-0008) is enforced here, not just requested in the
 * prompt: the model is only ever allowed to return ids drawn from the
 * places already saved to the trip, and every id it returns is checked
 * against that pool server-side before a single real Place row is attached
 * to the response. An id that isn't in the pool is silently dropped — the
 * model has no way to make a place exist in the output that doesn't already
 * exist in the database. See buildDayPlanCandidates below for exactly where
 * that check happens.
 * @packageDocumentation
 */

import { complete } from '../lib/ai/provider';
import {
  buildCandidates,
  type PlanCandidate,
} from '../lib/dayPlan/algorithmic';
import { getDecryptedKey } from './aiSettings';
import { requireTripAccess } from './auth-scope';
import { listPlaces } from './places';

export interface DayPlanRequest {
  tripId: string;
  focus: string[]; // Activity.category values
  pace: 'relaxed' | 'packed';
}

export interface DayPlanCandidate {
  label: string;
  places: { id: string; name: string; category: string }[];
}

type DayPlanResponse =
  | {
      candidates: DayPlanCandidate[];
      source: 'ai' | 'algorithmic';
      notice?: string;
    }
  | { error: string };

// listPlaces' return type, not a hand-maintained interface — keeps this file
// in lockstep with whatever fields Place actually carries without importing
// generated Prisma types directly (no other src/server module does either).
type Pool = Awaited<ReturnType<typeof listPlaces>>;
type PoolPlace = Pool[number];

// Below this, there isn't enough raw material for a day: the AI or
// algorithmic path would have to invent structure (or pad with junk) rather
// than sequence real choices. Per ADR-0008 the model must never be asked to
// supply facts it doesn't have, and "here's a day out of 1-2 places" is the
// same failure mode as inventing a place outright — better to send the user
// back to save more places first.
const MIN_POOL_SIZE = 3;
// A "day plan" of one place isn't a plan. A candidate that drops below this
// after id validation is discarded rather than shown half-empty.
const MIN_PLAN_PLACES = 2;
// Reasoning models spend most of their completion budget on hidden
// chain-of-thought before ever emitting the answer (measured live: 868 of
// 957 completion tokens on dots-3-note-preview) — src/lib/ai/provider.ts's
// own default (1500) is tuned for guideSummary's shorter prose answers and
// is not generous enough here. This has to cover both that hidden reasoning
// and 2-3 full JSON plans.
const MAX_TOKENS = 3000;

const TOO_FEW_PLACES_ERROR =
  'Save at least 3 places to this trip before generating a day plan.';
const NO_KEY_NOTICE =
  'No API key saved — generated without AI. Add one in Settings for AI-sequenced plans.';
const NO_MODEL_NOTICE =
  'No AI model chosen — generated without AI. Choose one in Settings for AI-sequenced plans.';
const AI_UNAVAILABLE_NOTICE =
  "Couldn't reach the AI provider — generated without AI instead.";
// Distinct from the above for the same reason guideSummary.ts keeps its
// no_room error distinct: a reasoning model that runs out of room fails the
// same way every time, so "try again" is the wrong advice. Framed as a
// notice, not an error, because the algorithmic path still produced a plan.
const NO_ROOM_NOTICE =
  'That model ran out of room before it answered — reasoning models use most ' +
  'of their budget thinking. Generated without AI instead; try a different ' +
  'model in Settings.';
const AI_INVALID_NOTICE =
  "The AI's answer didn't hold up to validation — generated without AI instead.";

// ADR-0008 is the entire point of this module and is not negotiable: the
// model chooses and sequences ids from the list it's given, nothing more.
// Kept short and blunt on purpose — a long prompt is not a safer prompt,
// it's just more surface for the model to reinterpret or ignore. The real
// guard is the server-side id check in buildAiCandidates below, which holds
// even if the model disregards every word of this.
const SYSTEM_PROMPT = `You sequence a day plan from a supplied list of places. Rules:
- Use only the ids in the supplied list. Never invent a place or an id that isn't there.
- Return only JSON matching this schema, nothing else: {"plans":[{"label":string,"placeIds":[string]}]}
- Produce 2 to 3 plans, each a different way to spend the day (e.g. by pace, focus, or area).
Ids that aren't in the supplied list are discarded before a user ever sees them, so inventing one only weakens your own answer.`;

// Data minimisation — deliberate, not an oversight. The model gets only
// id | name | category (+ cuisine when present): enough to sequence a day.
// It never gets the trip's name, dates, budget, collaborator emails, or the
// user's own notes on a place — none of that helps sequence a day, and the
// user may be on an OpenRouter `:free` model, whose endpoints ADR-0011
// records as training on and publishing prompts by default. Sending less
// than the model could theoretically use is the point, not a gap to fill in
// later.
function buildUserPrompt(pool: PoolPlace[], req: DayPlanRequest): string {
  const places = pool.map((place) => ({
    id: place.id,
    name: place.name,
    category: place.category,
    ...(place.cuisine ? { cuisine: place.cuisine } : {}),
  }));
  return JSON.stringify({ focus: req.focus, pace: req.pace, places });
}

interface RawPlan {
  label: string;
  placeIds: string[];
}

// Providers sometimes wrap JSON in ```json fences even when told not to
// (observed live, see docs/phase-3-research-layer-handoff.md) — strip them
// before parsing rather than fail on a well-formed answer.
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match ? match[1] : trimmed;
}

// Parses and structurally validates the model's response. Anything that
// doesn't match `{"plans":[{"label":string,"placeIds":string[]}]}` -
// malformed JSON, a missing field, a wrong type - resolves to null rather
// than throwing, so a bad model answer degrades to the algorithmic fallback
// like every other AI failure in this module.
function parseAiPlans(text: string): RawPlan[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(text));
  } catch {
    return null;
  }

  const plans = (parsed as { plans?: unknown } | null)?.plans;
  if (!Array.isArray(plans)) return null;

  const result: RawPlan[] = [];
  for (const entry of plans) {
    const label = (entry as { label?: unknown } | null)?.label;
    const placeIds = (entry as { placeIds?: unknown } | null)?.placeIds;
    if (typeof label !== 'string' || !label.trim()) continue;
    if (!Array.isArray(placeIds)) continue;
    if (!placeIds.every((id): id is string => typeof id === 'string')) continue;
    result.push({ label, placeIds });
  }
  return result.length > 0 ? result : null;
}

// The grounding enforcement point (ADR-0008): every placeId the model
// returned is looked up in `poolMap`, built only from this trip's own saved
// places. An id that isn't a key in that map — because the model invented
// it, mistyped it, or hallucinated one from a different trip entirely — is
// filtered out here and never reaches the caller. The response is built by
// mapping surviving ids back to the real Place rows, never by trusting any
// string the model produced as if it already described a place.
function resolveAiCandidates(
  rawPlans: RawPlan[],
  poolMap: Map<string, PoolPlace>,
): DayPlanCandidate[] {
  const candidates: DayPlanCandidate[] = [];
  for (const plan of rawPlans) {
    const places = plan.placeIds
      .map((id) => poolMap.get(id))
      .filter((place): place is PoolPlace => place != null)
      .map((place) => ({
        id: place.id,
        name: place.name,
        category: place.category,
      }));
    if (places.length < MIN_PLAN_PLACES) continue;
    candidates.push({ label: plan.label, places });
  }
  return candidates;
}

// Same id-to-real-row resolution as resolveAiCandidates, for the
// algorithmic path's own PlanCandidate output — buildCandidates deals only
// in ids too, so this module is the single place that ever turns an id into
// a Place the caller can render.
function resolveAlgorithmicCandidates(
  planCandidates: PlanCandidate[],
  poolMap: Map<string, PoolPlace>,
): DayPlanCandidate[] {
  return planCandidates.map((candidate) => ({
    label: candidate.label,
    places: candidate.placeIds
      .map((id) => poolMap.get(id))
      .filter((place): place is PoolPlace => place != null)
      .map((place) => ({
        id: place.id,
        name: place.name,
        category: place.category,
      })),
  }));
}

function algorithmicFallback(
  pool: PoolPlace[],
  poolMap: Map<string, PoolPlace>,
  req: DayPlanRequest,
  notice?: string,
): { candidates: DayPlanCandidate[]; source: 'algorithmic'; notice?: string } {
  const planCandidates = buildCandidates({
    places: pool,
    focus: req.focus,
    pace: req.pace,
  });
  return {
    candidates: resolveAlgorithmicCandidates(planCandidates, poolMap),
    source: 'algorithmic',
    ...(notice ? { notice } : {}),
  };
}

export async function generateDayPlans(
  req: DayPlanRequest,
): Promise<DayPlanResponse> {
  // Gate first, per CLAUDE.md — nothing below this runs for a trip the
  // caller can't access.
  await requireTripAccess(req.tripId);

  const pool = await listPlaces(req.tripId);
  if (pool.length < MIN_POOL_SIZE) {
    return { error: TOO_FEW_PLACES_ERROR };
  }
  const poolMap = new Map(pool.map((place) => [place.id, place]));

  const key = await getDecryptedKey();
  if (!key) {
    return algorithmicFallback(pool, poolMap, req, NO_KEY_NOTICE);
  }
  if (!key.model) {
    return algorithmicFallback(pool, poolMap, req, NO_MODEL_NOTICE);
  }

  const user = buildUserPrompt(pool, req);
  // jsonMode is not belt-and-braces on top of the prompt — it is what makes
  // this work at all. Verified live: without it, the same model spent its
  // entire budget reasoning and returned no answer ('no_room'); with it, clean
  // schema-shaped JSON on the first try.
  const result = await complete(key.key, key.model, SYSTEM_PROMPT, user, {
    maxTokens: MAX_TOKENS,
    jsonMode: true,
  });

  if (!result.ok) {
    return algorithmicFallback(
      pool,
      poolMap,
      req,
      result.reason === 'no_room' ? NO_ROOM_NOTICE : AI_UNAVAILABLE_NOTICE,
    );
  }

  const rawPlans = parseAiPlans(result.text);
  if (!rawPlans) {
    return algorithmicFallback(pool, poolMap, req, AI_INVALID_NOTICE);
  }

  const candidates = resolveAiCandidates(rawPlans, poolMap);
  if (candidates.length === 0) {
    return algorithmicFallback(pool, poolMap, req, AI_INVALID_NOTICE);
  }

  return { candidates, source: 'ai' };
}
