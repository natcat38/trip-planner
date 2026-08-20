import { beforeEach, describe, expect, it, vi } from 'vitest';
import { complete } from '../lib/ai/provider';
import { getGuide } from '../lib/research/wikivoyage';
import { getDecryptedKey } from './aiSettings';
import { ForbiddenOrNotFoundError, requireTripAccess } from './auth-scope';
import { summarizeGuide } from './guideSummary';

// Mocked as a plain factory (not importOriginal) so this never touches the
// real auth-scope.ts -> ../auth -> next-auth -> next/server chain — same
// rationale as places.test.ts / transit.test.ts.
vi.mock('./auth-scope', () => {
  class ForbiddenOrNotFoundError extends Error {
    constructor() {
      super("That trip doesn't exist or you don't have access.");
    }
  }
  return { requireTripAccess: vi.fn(), ForbiddenOrNotFoundError };
});
vi.mock('./aiSettings', () => ({ getDecryptedKey: vi.fn() }));
vi.mock('../lib/research/wikivoyage', () => ({ getGuide: vi.fn() }));
vi.mock('../lib/ai/provider', () => ({ complete: vi.fn() }));

beforeEach(() => {
  vi.mocked(requireTripAccess).mockReset();
  vi.mocked(getDecryptedKey).mockReset();
  vi.mocked(getGuide).mockReset();
  vi.mocked(complete).mockReset();
});

const trip = { id: 'trip-1', destinations: ['Fukuoka'] };
const storedKey = {
  key: 'gsk_realsecretvalue1234567890',
  provider: 'groq' as const,
  model: 'openai/gpt-oss-120b',
};

function emptyGuideSections() {
  return { eat: null, see: null, do: null, getAround: null, getIn: null };
}

const guide = {
  title: 'Fukuoka',
  url: 'https://en.wikivoyage.org/wiki/Fukuoka',
  coverage: 'good' as const,
  sections: {
    ...emptyGuideSections(),
    eat: 'Hakata ramen shops line Nakasu — a bowl runs about ¥800.',
    see: 'Fukuoka Tower — admission ¥1000.',
  },
};

describe('summarizeGuide', () => {
  it('refuses when requireTripAccess rejects', async () => {
    const denied = new ForbiddenOrNotFoundError();
    vi.mocked(requireTripAccess).mockRejectedValue(denied);

    await expect(summarizeGuide('trip-1')).rejects.toBe(denied);
    expect(getDecryptedKey).not.toHaveBeenCalled();
    expect(getGuide).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('returns a friendly error and never calls complete when no key is stored', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(getDecryptedKey).mockResolvedValue(null);

    const result = await summarizeGuide('trip-1');

    expect(result).toEqual({ error: expect.any(String) });
    expect((result as { error: string }).error).toMatch(/settings/i);
    expect(complete).not.toHaveBeenCalled();
  });

  it('returns a friendly error and never calls complete when a key is stored but no model is chosen', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(getDecryptedKey).mockResolvedValue({
      ...storedKey,
      model: null,
    });

    const result = await summarizeGuide('trip-1');

    expect(result).toEqual({ error: expect.any(String) });
    expect(complete).not.toHaveBeenCalled();
  });

  it('returns a friendly error, not a throw, when complete() resolves null', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(getGuide).mockResolvedValue(guide);
    vi.mocked(complete).mockResolvedValue({
      ok: false,
      reason: 'unavailable',
    });

    const result = await summarizeGuide('trip-1');

    expect(result).toEqual({ error: expect.any(String) });
  });

  it('returns a friendly error when the trip has no destination', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue({
      id: 'trip-1',
      destinations: [],
    } as never);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);

    const result = await summarizeGuide('trip-1');

    expect(result).toEqual({ error: expect.any(String) });
    expect(getGuide).not.toHaveBeenCalled();
    expect(complete).not.toHaveBeenCalled();
  });

  it('returns a friendly error when the guide has no usable content', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(getGuide).mockResolvedValue({
      title: 'Fukuoka',
      url: '',
      coverage: 'none',
      sections: emptyGuideSections(),
    });

    const result = await summarizeGuide('trip-1');

    expect(result).toEqual({ error: expect.any(String) });
    expect(complete).not.toHaveBeenCalled();
  });

  it('passes only the retrieved guide section text to the model, and the system prompt carries the grounding constraint', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(getGuide).mockResolvedValue(guide);
    vi.mocked(complete).mockResolvedValue({
      ok: true,
      text: 'A short summary.',
      truncated: false,
    });

    const result = await summarizeGuide('trip-1');

    expect(result).toEqual({ text: 'A short summary.' });
    expect(complete).toHaveBeenCalledTimes(1);
    const [apiKey, model, system, user] = vi.mocked(complete).mock.calls[0];

    expect(apiKey).toBe(storedKey.key);
    expect(model).toBe(storedKey.model);

    // The grounding rule (ADR-0008) lives in the system prompt, not just in
    // this module's own comments — this is the test that stops someone
    // quietly loosening the prompt later.
    expect(system).toMatch(/only facts/i);
    expect(system).toMatch(/do not add/i);
    expect(system).toMatch(/exactly as they appear/i);

    // Only the actually-retrieved section text reaches the user message —
    // never invented content, never a section that was null on the guide.
    expect(user).toContain('Hakata ramen shops line Nakasu');
    expect(user).toContain('¥800');
    expect(user).toContain('Fukuoka Tower');
  });

  it('flags a truncated completion instead of presenting a half-sentence', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(getGuide).mockResolvedValue(guide);
    // finish_reason 'length' — the model stopped at the output cap mid-thought.
    vi.mocked(complete).mockResolvedValue({
      ok: true,
      text: 'This area is located next to',
      truncated: true,
    });

    const result = await summarizeGuide('trip-1');

    expect(result).toHaveProperty('text');
    expect('text' in result && result.text).toMatch(/cut short/i);
    // The partial text is still shown — it's real, just incomplete.
    expect('text' in result && result.text).toContain(
      'This area is located next to',
    );
  });

  it('asks the model for plain text, not markdown', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(getGuide).mockResolvedValue(guide);
    vi.mocked(complete).mockResolvedValue({
      ok: true,
      text: 'ok',
      truncated: false,
    });

    await summarizeGuide('trip-1');

    // Raw markdown rendered as plain text is what the user actually saw
    // first time round: literal ### and ** in the output.
    const system = vi.mocked(complete).mock.calls[0][2];
    expect(system).toMatch(/plain text/i);
    expect(system).toMatch(/no markdown/i);
  });

  it('a verbose section does not starve the later ones', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    vi.mocked(getGuide).mockResolvedValue({
      title: 'Fukuoka',
      url: '',
      coverage: 'good',
      sections: {
        ...emptyGuideSections(),
        eat: 'x'.repeat(50_000),
        getAround: 'An all-day subway pass costs ¥640.',
      },
    });
    vi.mocked(complete).mockResolvedValue({
      ok: true,
      text: 'ok',
      truncated: false,
    });

    await summarizeGuide('trip-1');

    // Before the per-section budget, Fukuoka's Eat section consumed the whole
    // allowance and Get around — where the fares live, one of the three
    // questions this product answers — never reached the model at all.
    const [, , , user] = vi.mocked(complete).mock.calls[0];
    expect(user).toContain('Get around');
    expect(user).toContain('¥640');
  });

  it('truncates over-long guide text before sending it to the model', async () => {
    vi.mocked(requireTripAccess).mockResolvedValue(trip as never);
    vi.mocked(getDecryptedKey).mockResolvedValue(storedKey);
    const longText = 'x'.repeat(50_000);
    vi.mocked(getGuide).mockResolvedValue({
      title: 'Fukuoka',
      url: '',
      coverage: 'good',
      sections: { ...emptyGuideSections(), eat: longText },
    });
    vi.mocked(complete).mockResolvedValue({
      ok: true,
      text: 'A short summary.',
      truncated: false,
    });

    await summarizeGuide('trip-1');

    const [, , , user] = vi.mocked(complete).mock.calls[0];
    // Per-section budget is 2000 chars; allow headroom for headings only.
    expect(user.length).toBeLessThan(3000);
    // Sane, documented cap rather than an untruncated 50,000-char blob.
    expect(user.length).toBeLessThanOrEqual(6000);
  });
});
