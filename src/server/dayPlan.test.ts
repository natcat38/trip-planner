import { beforeEach, describe, expect, it, vi } from 'vitest';
import { complete } from '../lib/ai/provider';
import { buildCandidates } from '../lib/dayPlan/algorithmic';
import { getDecryptedKey } from './aiSettings';
import { ForbiddenOrNotFoundError, requireTripAccess } from './auth-scope';
import { generateDayPlans } from './dayPlan';
import { listPlaces } from './places';

// Mocked as a plain factory (not importOriginal) so this never touches the
// real auth-scope.ts -> ../auth -> next-auth -> next/server chain — same
// rationale as places.test.ts / guideSummary.test.ts.
vi.mock('./auth-scope', () => {
  class ForbiddenOrNotFoundError extends Error {
    constructor() {
      super("That trip doesn't exist or you don't have access.");
    }
  }
  return { requireTripAccess: vi.fn(), ForbiddenOrNotFoundError };
});
vi.mock('./places', () => ({ listPlaces: vi.fn() }));
vi.mock('./aiSettings', () => ({ getDecryptedKey: vi.fn() }));
vi.mock('../lib/ai/provider', () => ({ complete: vi.fn() }));
// algorithmic.ts is written by a separate task in this same milestone —
// only its exported shape (buildCandidates(input): {label, placeIds}[]) is
// a fixed contract here, never its real clustering logic.
vi.mock('../lib/dayPlan/algorithmic', () => ({ buildCandidates: vi.fn() }));

beforeEach(() => {
  vi.mocked(requireTripAccess).mockReset();
  vi.mocked(listPlaces).mockReset();
  vi.mocked(getDecryptedKey).mockReset();
  vi.mocked(complete).mockReset();
  vi.mocked(buildCandidates).mockReset();
});

// Destination deliberately does not overlap with any pool place's name below
// (which are all Fukuoka landmarks) — that keeps the "trip metadata never
// reaches the prompt" assertion meaningful instead of accidentally passing
// because a place name happens to contain the city name too.
const trip = {
  id: 'trip-1',
  name: 'Secret Anniversary Trip',
  destinations: ['Lisbon'],
};

const storedKey = {
  key: 'gsk_realsecretvalue1234567890',
  provider: 'groq' as const,
  model: 'openai/gpt-oss-120b',
};

function place(
  overrides: Partial<Awaited<ReturnType<typeof listPlaces>>[number]>,
) {
  return {
    id: 'place-default',
    tripId: 'trip-1',
    source: 'osm',
    sourceId: null,
    name: 'Default Place',
    lat: 33.59,
    lng: 130.4,
    category: 'Sightseeing',
    cuisine: null,
    openingHours: null,
    website: null,
    phone: null,
    notes: null,
    costMinor: null,
    costCurrency: null,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  } as Awaited<ReturnType<typeof listPlaces>>[number];
}

const pool = [
  place({ id: 'p1', name: 'Fukuoka Tower', category: 'Sightseeing' }),
  place({ id: 'p2', name: 'Hakata Ramen', category: 'Food', cuisine: 'Ramen' }),
  place({ id: 'p3', name: 'Ohori Park', category: 'Sightseeing' }),
  place({ id: 'p4', name: 'Canal City', category: 'Shopping' }),
];

const req = {
  tripId: 'trip-1',
  focus: ['Food', 'Sightseeing'],
  pace: 'relaxed' as const,
};

function aiResponse(plans: { label: string; placeIds: string[] }[]) {
  return {
    ok: true as const,
    text: JSON.stringify({ plans }),
    truncated: false,
  };
}

describe('generateDayPlans', () => {
  it('refuses when requireTripAccess rejects', async () => {
    const denied = new ForbiddenOrNotFoundError();
    vi.mocked(requireTripAccess).mockRejectedValue(denied);

    await expect(generateDayPlans(req)).rejects.toBe(denied);
    expect(listPlaces).not.toHaveBeenCalled();
    expect(getDecryptedKey).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('returns a friendly error and never calls the model when too few places are saved', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool.slice(0, 2));

    const result = await generateDayPlans(req);

    expect(result).toEqual({ error: expect.any(String) });
    expect((result as { error: string }).error).toMatch(/save/i);
    expect(getDecryptedKey).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('falls back to the algorithmic path when no key is stored, and never calls the model', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool);
    vi.mocked(getDecryptedKey).mockResolvedValue(null);
    vi.mocked(buildCandidates).mockReturnValue([
      { label: 'A relaxed day', placeIds: ['p1', 'p2'] },
    ]);

    const result = await generateDayPlans(req);

    expect(complete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ source: 'algorithmic' });
    expect('candidates' in result && result.candidates).toEqual([
      {
        label: 'A relaxed day',
        places: [
          { id: 'p1', name: 'Fukuoka Tower', category: 'Sightseeing' },
          { id: 'p2', name: 'Hakata Ramen', category: 'Food' },
        ],
      },
    ]);
    expect('notice' in result && result.notice).toMatch(/api key/i);
  });

  it('falls back to the algorithmic path when a key is stored but no model is chosen', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool);
    vi.mocked(getDecryptedKey).mockResolvedValue({ ...storedKey, model: null });
    vi.mocked(buildCandidates).mockReturnValue([
      { label: 'A relaxed day', placeIds: ['p1', 'p2'] },
    ]);

    const result = await generateDayPlans(req);

    expect(complete).not.toHaveBeenCalled();
    expect(result).toMatchObject({ source: 'algorithmic' });
    expect('notice' in result && result.notice).toMatch(/model/i);
  });

  it('maps a valid AI response to real places and reports source: ai', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(complete).mockResolvedValue(
      aiResponse([
        { label: 'Iconic sights', placeIds: ['p1', 'p3'] },
        { label: 'Food crawl', placeIds: ['p2', 'p4'] },
      ]),
    );

    const result = await generateDayPlans(req);

    expect(result).toMatchObject({ source: 'ai' });
    expect('candidates' in result && result.candidates).toEqual([
      {
        label: 'Iconic sights',
        places: [
          { id: 'p1', name: 'Fukuoka Tower', category: 'Sightseeing' },
          { id: 'p3', name: 'Ohori Park', category: 'Sightseeing' },
        ],
      },
      {
        label: 'Food crawl',
        places: [
          { id: 'p2', name: 'Hakata Ramen', category: 'Food' },
          { id: 'p4', name: 'Canal City', category: 'Shopping' },
        ],
      },
    ]);
    expect(buildCandidates).not.toHaveBeenCalled();
  });

  it('drops a repeated id rather than listing the same place twice', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool as never);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(complete).mockResolvedValue({
      ok: true,
      truncated: false,
      text: JSON.stringify({
        plans: [{ label: 'Repeats', placeIds: ['p1', 'p1', 'p2'] }],
      }),
    });

    const result = await generateDayPlans({
      tripId: 'trip-1',
      focus: [],
      pace: 'relaxed',
    });

    // Accepting a plan loops addActivityFromPlace over these ids, so a repeat
    // would create two identical activities on the same day.
    const ids = ('candidates' in result ? result.candidates[0].places : []).map(
      (p) => p.id,
    );
    expect(ids).toEqual(['p1', 'p2']);
  });

  it('reports a truncated answer as a budget problem, not a bad answer', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool as never);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(buildCandidates).mockReturnValue([
      { label: 'Nearby', placeIds: ['p1', 'p2'] },
    ]);
    vi.mocked(complete).mockResolvedValue({
      ok: true,
      truncated: true,
      text: '{"plans":[{"label":"Cut off","placeIds":["p1","p',
    });

    const result = await generateDayPlans({
      tripId: 'trip-1',
      focus: [],
      pace: 'relaxed',
    });

    expect('candidates' in result && result.source).toBe('algorithmic');
    expect('candidates' in result && result.notice).toMatch(/ran out of room/i);
  });

  it('drops invented ids that are not in the saved-places pool', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(complete).mockResolvedValue(
      aiResponse([
        {
          label: 'Mixed',
          // 'ghost-1' and 'ghost-2' do not exist in the pool — the model
          // invented them (or hallucinated ids from another trip).
          placeIds: ['p1', 'ghost-1', 'p2', 'ghost-2'],
        },
      ]),
    );

    const result = await generateDayPlans(req);

    expect(result).toMatchObject({ source: 'ai' });
    const candidates = 'candidates' in result ? result.candidates : [];
    expect(candidates).toHaveLength(1);
    const ids = candidates[0].places.map((p) => p.id);
    expect(ids).toEqual(['p1', 'p2']);
    expect(ids).not.toContain('ghost-1');
    expect(ids).not.toContain('ghost-2');
  });

  it('drops a plan that has fewer than 2 valid places after filtering', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(complete).mockResolvedValue(
      aiResponse([
        // Only one valid id survives (the other two are invented) — dropped.
        { label: 'Too thin', placeIds: ['p1', 'ghost-1', 'ghost-2'] },
        { label: 'Still good', placeIds: ['p2', 'p3'] },
      ]),
    );

    const result = await generateDayPlans(req);

    expect(result).toMatchObject({ source: 'ai' });
    const candidates = 'candidates' in result ? result.candidates : [];
    expect(candidates).toHaveLength(1);
    expect(candidates[0].label).toBe('Still good');
  });

  it('falls back to algorithmic when every AI plan is dropped for having too few valid places', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(complete).mockResolvedValue(
      aiResponse([{ label: 'All ghosts', placeIds: ['ghost-1', 'ghost-2'] }]),
    );
    vi.mocked(buildCandidates).mockReturnValue([
      { label: 'Fallback plan', placeIds: ['p1', 'p2'] },
    ]);

    const result = await generateDayPlans(req);

    expect(result).toMatchObject({ source: 'algorithmic' });
    expect(buildCandidates).toHaveBeenCalledTimes(1);
  });

  it('parses a JSON response wrapped in a ```json code fence', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    const payload = JSON.stringify({
      plans: [{ label: 'Fenced', placeIds: ['p1', 'p2'] }],
    });
    vi.mocked(complete).mockResolvedValue({
      ok: true,
      text: `\`\`\`json\n${payload}\n\`\`\``,
      truncated: false,
    });

    const result = await generateDayPlans(req);

    expect(result).toMatchObject({ source: 'ai' });
    const candidates = 'candidates' in result ? result.candidates : [];
    expect(candidates[0].label).toBe('Fenced');
  });

  it('falls back to algorithmic, not a throw, on malformed/non-JSON model output', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(complete).mockResolvedValue({
      ok: true,
      text: 'Sure! Here is a great day plan for you in prose form.',
      truncated: false,
    });
    vi.mocked(buildCandidates).mockReturnValue([
      { label: 'Fallback plan', placeIds: ['p1', 'p2'] },
    ]);

    await expect(generateDayPlans(req)).resolves.toMatchObject({
      source: 'algorithmic',
    });
  });

  it('falls back to algorithmic with an explanatory notice when complete() reports no_room', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(complete).mockResolvedValue({ ok: false, reason: 'no_room' });
    vi.mocked(buildCandidates).mockReturnValue([
      { label: 'Fallback plan', placeIds: ['p1', 'p2'] },
    ]);

    const result = await generateDayPlans(req);

    expect(result).toMatchObject({ source: 'algorithmic' });
    expect('notice' in result && result.notice).toMatch(/ran out of room/i);
  });

  it('falls back to algorithmic when complete() reports unavailable', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(complete).mockResolvedValue({ ok: false, reason: 'unavailable' });
    vi.mocked(buildCandidates).mockReturnValue([
      { label: 'Fallback plan', placeIds: ['p1', 'p2'] },
    ]);

    const result = await generateDayPlans(req);

    expect(result).toMatchObject({ source: 'algorithmic' });
  });

  it('never puts the trip name or destinations in the prompt sent to the model', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue(pool);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(complete).mockResolvedValue(
      aiResponse([{ label: 'Iconic sights', placeIds: ['p1', 'p2'] }]),
    );

    await generateDayPlans(req);

    expect(complete).toHaveBeenCalledTimes(1);
    const [apiKey, model, system, user] = vi.mocked(complete).mock.calls[0];
    expect(apiKey).toBe(storedKey.key);
    expect(model).toBe(storedKey.model);

    // The privacy guarantee (data minimisation, ADR-0011): never the trip's
    // name, destinations, or any other trip metadata — only id/name/category
    // for the places actually saved.
    expect(system).not.toContain(trip.name);
    expect(user).not.toContain(trip.name);
    expect(user).not.toContain('Lisbon');
    expect(user).not.toContain(trip.id);

    // But it does carry the minimal place data + the request's own focus/pace.
    expect(user).toContain('Fukuoka Tower');
    expect(user).toContain('relaxed');
  });

  it('sends only id, name, category, and cuisine per place — never notes or cost', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(listPlaces).mockResolvedValue([
      place({
        id: 'p1',
        name: 'Hakata Ramen',
        category: 'Food',
        cuisine: 'Ramen',
        notes: 'Companion loved this — go back for anniversary',
        costMinor: 80000,
        costCurrency: 'JPY',
      }),
      ...pool.slice(1),
    ]);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(complete).mockResolvedValue(
      aiResponse([{ label: 'Iconic sights', placeIds: ['p1', 'p2'] }]),
    );

    await generateDayPlans(req);

    const [, , , user] = vi.mocked(complete).mock.calls[0];
    expect(user).toContain('Ramen');
    expect(user).not.toContain('anniversary');
    expect(user).not.toContain('80000');
    expect(user).not.toContain('JPY');
  });
});
