/**
 * BYOK AI layer: talks to the user's own Groq or OpenRouter API key over their shared
 * OpenAI-compatible surface (`POST {base}/chat/completions`, `GET {base}/models`,
 * `Authorization: Bearer {key}`) — see docs/adr/0009-gemini-free-tier-unusable-eea.md for why
 * these two providers and not a Gemini-direct or app-held-key design. Server-only, never
 * throws: network/auth/parse failures resolve to `null` (or `{ ok: false }` for `testKey`),
 * matching the fallback philosophy of ../research/transitous.ts and ../research/overpass.ts.
 *
 * This module is deliberately dumb: `complete()` takes a system + user prompt and returns text,
 * nothing more. Prompt construction, model-selection UI, and key storage/encryption live
 * elsewhere (src/lib/crypto.ts, the settings route). Per ADR-0008, whatever this module returns
 * is a *reformatting* of facts the research layer already retrieved — it must never become a
 * source of facts itself.
 * @packageDocumentation
 */

import { USER_AGENT } from '../research/userAgent';

export type AiProvider = 'groq' | 'openrouter';

const GROQ_BASE = 'https://api.groq.com/openai/v1';
const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Chat completions can take noticeably longer than the research layer's keyless lookups (this
// is generation, not an index lookup) — 30s gives a real model room to finish without hanging a
// request indefinitely.
const REQUEST_TIMEOUT_MS = 30_000;
// Generous enough for a multi-section guide summary. Providers' own defaults
// are often far smaller, which silently clips the answer mid-sentence.
const MAX_OUTPUT_TOKENS = 1500;

function baseUrlFor(provider: AiProvider): string {
  return provider === 'groq' ? GROQ_BASE : OPENROUTER_BASE;
}

// Groq and OpenRouter keys have distinct, documented prefixes, so we can route without an extra
// request and without asking the user which provider they're on. An unrecognised prefix returns
// null so the caller can say "that doesn't look like a Groq or OpenRouter key" instead of firing
// a request that's doomed to 401.
export function detectProvider(apiKey: string): AiProvider | null {
  if (apiKey.startsWith('gsk_')) return 'groq';
  if (apiKey.startsWith('sk-or-v1-')) return 'openrouter';
  return null;
}

interface ErrorBody {
  error?: { message?: string };
}

// Shared request helper: every call in this module is a fetch against one of the two providers'
// OpenAI-compatible surface, differing only in base URL and (for OpenRouter) a couple of
// optional attribution headers. Never throws — network error, timeout, and non-JSON bodies all
// resolve to null. Status-code handling (401 vs 429 vs other) is left to each caller since
// testKey/listModels/complete each react to it differently.
async function request(
  provider: AiProvider,
  apiKey: string,
  path: string,
  init: RequestInit,
): Promise<{ status: number; body: unknown } | null> {
  try {
    const res = await fetch(`${baseUrlFor(provider)}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
        // OpenRouter reads these for attribution/ranking on its dashboard; Groq ignores them.
        // Optional per OpenRouter's docs — sent anyway as good citizenship, never required.
        'HTTP-Referer': 'https://trip-planner-cyan-five.vercel.app',
        'X-Title': 'Trip Planner',
        ...init.headers,
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    const body: unknown = await res.json().catch(() => null);
    return { status: res.status, body };
  } catch {
    // Network error, timeout/abort: never throw (house pattern, same as transitous.ts).
    return null;
  }
}

// Groq's own docs contradict themselves about which chat models are currently live (the API
// schema lists models the same docs page calls deprecated — verified live, see
// docs/phase-3-research-layer-handoff.md). So this module never hardcodes a model list: it asks
// the provider with the user's own key and offers back whatever actually comes back right now.
interface ModelsApiEntry {
  id?: string;
}
interface ModelsApiResponse {
  data?: ModelsApiEntry[];
}

// Groq's `compound` / `compound-mini` models run their own built-in web search and code
// execution. Offering them here would let un-vetted live web content reach the user framed as
// fact — exactly what ADR-0008 forbids ("no user-visible fact may be model-generated"). Excluded
// at the source, not filtered in the UI, so there is exactly one place guarding this rule. Do
// not re-add without revisiting ADR-0008 first.
const COMPOUND_MODEL_PATTERN = /^groq\/compound/i;

export async function listModels(
  apiKey: string,
): Promise<{ id: string; free: boolean }[] | null> {
  const provider = detectProvider(apiKey);
  if (!provider) return null;

  const result = await request(provider, apiKey, '/models', {
    method: 'GET',
  });
  if (!result || result.status !== 200) return null;

  const data = (result.body as ModelsApiResponse | null)?.data;
  if (!Array.isArray(data)) return null;

  const models: { id: string; free: boolean }[] = [];
  for (const entry of data) {
    if (typeof entry?.id !== 'string') continue;
    if (COMPOUND_MODEL_PATTERN.test(entry.id)) continue;
    models.push({ id: entry.id, free: entry.id.endsWith(':free') });
  }
  return models;
}

interface ChatCompletionResponse {
  choices?: { message?: { content?: string }; finish_reason?: string }[];
}

export interface Completion {
  text: string;
  /** The model hit the output cap mid-thought; the text is incomplete. */
  truncated: boolean;
}

export async function complete(
  apiKey: string,
  model: string,
  system: string,
  user: string,
): Promise<Completion | null> {
  const provider = detectProvider(apiKey);
  if (!provider) return null;

  const result = await request(provider, apiKey, '/chat/completions', {
    method: 'POST',
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      // Without this the model uses whatever default the provider picks, which
      // is often small enough to stop a summary mid-sentence. Observed live:
      // a Fukuoka summary cut off at "This area is located next to".
      max_tokens: MAX_OUTPUT_TOKENS,
    }),
  });
  if (!result || result.status !== 200) return null;

  const choice = (result.body as ChatCompletionResponse | null)?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || content.length === 0) return null;

  // finish_reason 'length' means the model was still going when it hit the cap.
  // Callers surface that rather than presenting a half-sentence as the answer.
  return { text: content, truncated: choice?.finish_reason === 'length' };
}

// Dedicated, idempotent, zero-cost credential-check endpoints — deliberately not
// /chat/completions. Verified live: Groq's /models requires a key and 401s a bad one; OpenRouter's
// /key is the auth-status endpoint (its /models listing is public with no key at all, so it
// can't tell a valid key from garbage). Using a GET here means testKey never spends a cent of
// the user's own metered quota and is safe to retry, unlike a completion POST.
function testKeyPathFor(provider: AiProvider): string {
  return provider === 'groq' ? '/models' : '/key';
}

export async function testKey(
  apiKey: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const provider = detectProvider(apiKey);
  if (!provider) {
    return { ok: false, reason: 'Not a recognised Groq or OpenRouter key.' };
  }

  const result = await request(provider, apiKey, testKeyPathFor(provider), {
    method: 'GET',
  });

  if (!result) {
    return {
      ok: false,
      reason: 'Could not reach the provider. Try again shortly.',
    };
  }
  if (result.status === 200) return { ok: true };
  if (result.status === 401) {
    const message = (result.body as ErrorBody | null)?.error?.message;
    return {
      ok: false,
      reason: typeof message === 'string' ? message : 'Key was rejected.',
    };
  }
  // Anything else (429, 5xx, ...) — never hardcode rate limits (both providers publish them as
  // mutable, and Groq says they vary per organisation), so just fail gracefully with a generic
  // reason rather than trying to enumerate every status code.
  return { ok: false, reason: 'Something went wrong. Try again shortly.' };
}
