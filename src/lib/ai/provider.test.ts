import { afterEach, describe, expect, it, vi } from 'vitest';
import { complete, detectProvider, listModels, testKey } from './provider';

const GROQ_KEY = 'gsk_realistictestkey1234567890abcdef';
const OPENROUTER_KEY = 'sk-or-v1-realistictestkey1234567890abcdef';

function jsonResponse(status: number, body: unknown) {
  return { status, json: () => Promise.resolve(body) };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('detectProvider', () => {
  it('recognises a Groq key by its gsk_ prefix', () => {
    expect(detectProvider(GROQ_KEY)).toBe('groq');
  });

  it('recognises an OpenRouter key by its sk-or-v1- prefix', () => {
    expect(detectProvider(OPENROUTER_KEY)).toBe('openrouter');
  });

  it('returns null for an unrecognised prefix', () => {
    expect(detectProvider('sk-not-a-real-provider-key')).toBeNull();
    expect(detectProvider('')).toBeNull();
  });
});

describe('request routing', () => {
  it('sends listModels requests to the Groq base URL with a bearer token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: [{ id: 'llama-3.1-8b' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await listModels(GROQ_KEY);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${GROQ_KEY}`,
        }),
      }),
    );
  });

  it('sends listModels requests to the OpenRouter base URL with a bearer token', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: [{ id: 'some/model' }] }));
    vi.stubGlobal('fetch', fetchMock);

    await listModels(OPENROUTER_KEY);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: `Bearer ${OPENROUTER_KEY}`,
        }),
      }),
    );
  });

  it('sends complete requests to POST {base}/chat/completions', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        choices: [{ message: { content: 'hi there' } }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await complete(GROQ_KEY, 'llama-3.1-8b', 'be terse', 'hello');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: `Bearer ${GROQ_KEY}`,
        }),
      }),
    );
  });
});

describe('complete', () => {
  it('returns the assistant text from a realistic OpenAI-shaped response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          id: 'chatcmpl-123',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: 'The answer is 42.' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      ),
    );

    const result = await complete(
      GROQ_KEY,
      'llama-3.1-8b',
      'system prompt',
      'user prompt',
    );

    expect(result).toEqual({ text: 'The answer is 42.', truncated: false });
  });

  it('returns null for an empty choices array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(200, { choices: [] })),
    );

    const result = await complete(GROQ_KEY, 'llama-3.1-8b', 'sys', 'usr');

    expect(result).toBeNull();
  });

  it('returns null for malformed JSON shapes missing message.content', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(jsonResponse(200, { choices: [{ message: {} }] })),
    );

    const result = await complete(GROQ_KEY, 'llama-3.1-8b', 'sys', 'usr');

    expect(result).toBeNull();
  });

  it('returns null for an unrecognised key without making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await complete('not-a-key', 'model', 'sys', 'usr');

    expect(result).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('complete output limits', () => {
  it('sends an explicit max_tokens so the provider default cannot clip the answer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        choices: [{ message: { content: 'hi' }, finish_reason: 'stop' }],
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await complete('gsk_test', 'm', 'sys', 'usr');

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.max_tokens).toBeGreaterThan(0);
  });

  it('reports truncated when the model stopped at the output cap', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          choices: [
            {
              message: { content: 'This area is located next to' },
              finish_reason: 'length',
            },
          ],
        }),
      ),
    );

    const result = await complete('gsk_test', 'm', 'sys', 'usr');

    expect(result).toEqual({
      text: 'This area is located next to',
      truncated: true,
    });
  });
});

describe('testKey', () => {
  it('returns ok:false with the Groq 401 error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: {
            message: 'Invalid API Key',
            type: 'invalid_request_error',
            code: 'invalid_api_key',
          },
        }),
      ),
    );

    const result = await testKey(GROQ_KEY);

    expect(result).toEqual({ ok: false, reason: 'Invalid API Key' });
  });

  it('returns ok:false with the OpenRouter 401 error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { message: 'User not found.', code: 401 },
        }),
      ),
    );

    const result = await testKey(OPENROUTER_KEY);

    expect(result).toEqual({ ok: false, reason: 'User not found.' });
  });

  it('returns ok:true for Groq by hitting GET /openai/v1/models', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: [{ id: 'llama-3.1-8b' }] }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await testKey(GROQ_KEY);

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${GROQ_KEY}`,
        }),
      }),
    );
  });

  it('returns ok:true for OpenRouter by hitting GET /api/v1/key', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, { data: { label: 'my key' } }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await testKey(OPENROUTER_KEY);

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/key',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: `Bearer ${OPENROUTER_KEY}`,
        }),
      }),
    );
  });

  it('returns ok:false with the OpenRouter no-cookie 401 error message', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { message: 'No cookie auth credentials found', code: 401 },
        }),
      ),
    );

    const result = await testKey(OPENROUTER_KEY);

    expect(result).toEqual({
      ok: false,
      reason: 'No cookie auth credentials found',
    });
  });

  it('fails gracefully on 429 without throwing, with a generic reason', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(429, { error: { message: 'Rate limit exceeded' } }),
        ),
    );

    const result = await testKey(GROQ_KEY);

    expect(result).toEqual({
      ok: false,
      reason: 'Something went wrong. Try again shortly.',
    });
  });

  it('fails gracefully on a network error without throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNRESET')));

    await expect(testKey(GROQ_KEY)).resolves.toEqual(
      expect.objectContaining({ ok: false }),
    );
  });

  it('fails gracefully on a timeout without throwing', async () => {
    const abortError = new DOMException(
      'The operation was aborted.',
      'AbortError',
    );
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    await expect(testKey(GROQ_KEY)).resolves.toEqual(
      expect.objectContaining({ ok: false }),
    );
  });

  it('returns ok:false for an unrecognised key format without making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await testKey('totally-unrecognised-prefix');

    expect(result.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('listModels', () => {
  it('marks OpenRouter models whose id ends :free', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: [
            {
              id: 'meta-llama/llama-3.1-8b-instruct:free',
              name: 'Llama 3.1 8B (free)',
            },
            { id: 'openai/gpt-4o', name: 'GPT-4o' },
          ],
        }),
      ),
    );

    const models = await listModels(OPENROUTER_KEY);

    expect(models).toEqual([
      { id: 'meta-llama/llama-3.1-8b-instruct:free', free: true },
      { id: 'openai/gpt-4o', free: false },
    ]);
  });

  it('excludes groq/compound and groq/compound-mini from the results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(200, {
          data: [
            { id: 'groq/compound' },
            { id: 'groq/compound-mini' },
            { id: 'llama-3.1-8b-instant' },
          ],
        }),
      ),
    );

    const models = await listModels(GROQ_KEY);

    expect(models).toEqual([{ id: 'llama-3.1-8b-instant', free: false }]);
    expect(models?.some((m) => m.id.startsWith('groq/compound'))).toBe(false);
  });

  it('returns null on a non-200 response', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse(401, { error: { message: 'bad key' } }),
        ),
    );

    const models = await listModels(GROQ_KEY);

    expect(models).toBeNull();
  });

  it('returns null for an unrecognised key without making a request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const models = await listModels('not-a-key');

    expect(models).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('API key never leaks', () => {
  it('never appears in complete/testKey/listModels return values or thrown errors', async () => {
    const secretKey = 'gsk_supersecretvalue_shouldneverleak';

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse(401, {
          error: { message: 'Invalid API Key', code: 'invalid_api_key' },
        }),
      ),
    );
    const testKeyResult = await testKey(secretKey);
    expect(JSON.stringify(testKeyResult)).not.toContain(secretKey);

    // Also cover the failure path where nothing in our own code has a chance to echo the key
    // back — a thrown/rejected fetch, e.g. the request URL itself failing to construct.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error(`boom ${secretKey}`)),
    );
    const completeResult = await complete(secretKey, 'model', 'sys', 'usr');
    expect(JSON.stringify(completeResult)).not.toContain(secretKey);

    const modelsResult = await listModels(secretKey);
    expect(JSON.stringify(modelsResult)).not.toContain(secretKey);
  });
});
