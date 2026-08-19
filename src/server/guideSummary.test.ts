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
    vi.mocked(complete).mockResolvedValue(null);

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
    vi.mocked(complete).mockResolvedValue('A short summary.');

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
    vi.mocked(complete).mockResolvedValue('A short summary.');

    await summarizeGuide('trip-1');

    const [, , , user] = vi.mocked(complete).mock.calls[0];
    expect(user.length).toBeLessThan(longText.length);
    // Sane, documented cap rather than an untruncated 50,000-char blob.
    expect(user.length).toBeLessThanOrEqual(6000);
  });
});
