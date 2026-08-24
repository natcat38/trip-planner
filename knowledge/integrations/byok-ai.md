---
type: Integration
title: BYOK AI
description: Bring-your-own-key AI layer — the user supplies a Groq or OpenRouter key, stored encrypted, used only to reformat text the app already retrieved.
resource: ../../docs/adr/0011-byok-ai-groq-default.md
tags: [integration, ai, byok, security]
timestamp: 2026-08-20T00:00:00Z
---

# Schema

The app holds **no AI key of its own**. Each user supplies their own, so cost stays with whoever
chooses to use it and ADR-0001's $0/month constraint is untouched.

- `src/lib/crypto.ts` — AES-256-GCM (node `crypto`, no dependency) under the `ENCRYPTION_KEY` env
  var. Fresh random IV per encryption; a failed decrypt returns `null` and is treated as
  "no key stored", never an exception.
- `src/lib/ai/provider.ts` — both providers are OpenAI-compatible, so one path branches on key
  prefix: `gsk_` → **Groq**, `sk-or-v1-` → **OpenRouter**. Never throws.
- `src/server/aiSettings.ts` — every export gates on `currentUserId()`. **The plaintext key never
  returns to the browser**; reads yield a mask.
- `/settings` — paste, test, pick a model, remove. The route was added to `src/proxy.ts`'s matcher
  **before** it existed: an unmatched route is simply public, and that failure is silent.

**Groq is the default, on privacy grounds.** Its agreement forbids training on inputs unless the
customer grants permission, whereas OpenRouter's `:free` endpoints generally *require* permission
to train on and publish prompts — the same objection that disqualified Gemini
([ADR-0009](../../docs/adr/0009-gemini-free-tier-unusable-eea.md)). Trip data carries hotel and
travel-companion names, so the UI warns plainly before a `:free` model is chosen.

⚠️ **No model ids are hardcoded.** Groq's own docs contradict themselves about which models are
live, so the app asks the provider with the user's key and offers what comes back. Groq's
`compound*` models are excluded: their built-in web search would let un-vetted content reach the
user as fact.

**The grounding rule ([ADR-0008](../../docs/adr/0008-grounded-research-no-generative-layer.md)) is
unchanged and is what the AI layer is allowed to do.** The model reformats and condenses text the
app already fetched from Wikivoyage; it is never a source of facts, and prices are reproduced
verbatim, never computed. Output is labelled as AI-reformatted with the source attribution intact.

**In practice, OpenRouter is the provider actually used.** Groq's sign-up page would not
complete when tested (Aug 2026), so its success path has never been exercised; see the
ADR-0011 addendum.

# Citations

[ADR-0011](../../docs/adr/0011-byok-ai-groq-default.md).
