# ADR-0009: Gemini's free tier is unusable for this app; a BYOK AI layer defaults to OpenRouter

**Status:** Accepted (2026-08-20)

## Context
The $0/month constraint (ADR-0001) pushes any future AI layer toward free tiers. Google's Gemini
free tier is the usual first pick, and was the first draft's assumption. Its Terms of Service
say:

> "You may use only Paid Services when making API Clients available to users in the European
> Economic Area, Switzerland, or the United Kingdom."

That clause binds **the application**, not the end user's account status. This is a
Japan/**Europe** trip planner, so European users are in scope by definition, and a user pasting
their own free-tier key does not cure it — the app is still the "API Client made available".
The breach also fails **silently**: the call succeeds and only surfaces on audit.

Separately, on the Unpaid tier Google states it uses submitted content to improve its products
and that human reviewers may read and annotate API input and output. Trip data can carry hotel
names and travel-companion names, so this would need explicit disclosure even where the EEA
clause does not bite.

Surveyed alternatives (handoff retired 2026-08-24; see `knowledge/integrations/byok-ai.md`, Aug 2026):

- **GitHub Models is retired** (2026-07-30). Articles still recommending it are stale.
- **OpenRouter** — ToS §5.2 explicitly contemplates serving your own end users, no EEA
  restriction, BYOK is a documented first-class feature.
- **Groq** — cleanest terms surveyed; §3.1 explicitly authorizes making it available to end
  users through a "Customer Application", with a UK/EEA contracting entity and an SCC DPA, and
  it states it never trains on customer data.
- **No provider's free tier can serve all users from one app-held key** at real scale.
  Cloudflare Workers AI is the only structural app-held option and is demo-sized.

## Decision
1. **Gemini-direct is blocked** for this app while the EEA/Switzerland/UK clause stands, on the
   free tier, including via user-supplied free-tier keys.
2. When an AI layer ships (roadmap M3), it is **BYOK** — the user's own metered API key —
   with **OpenRouter as the default** and **Groq second**, both ToS-clean for third-party apps
   and for EEA users.
3. Keys are encrypted at rest (AES-256-GCM via node `crypto`, no new dependency), and the
   `/settings` route that holds them must extend the `src/proxy.ts` matcher **before** it ships
   (today it is hard-scoped to `/trips/:path*`, so a new route would be public), plus an
   in-action `currentUserId()` guard as defence in depth.
4. Rate limits are **never hardcoded** — Google no longer publishes a fixed table and providers
   change them. Handle 429s.
5. App docs must tell OpenRouter users to keep the "train on inputs" / "publish prompts"
   account toggles off, and must never opt into prompt-logging discounts.

## Consequences
- v1 ships with no AI at all (ADR-0008), so none of this is load-bearing yet — it is recorded so
  the ToS research is not repeated.
- Whether routing Gemini *through* OpenRouter cures the EEA problem is **unresolved**; do not
  rely on it. It is moot given other free models.
- Whether a provider permits an end user to hand a personal key to a third-party app calling it
  server-side has **no explicit clause either way** for Google. OpenRouter and Groq allow it in
  their own terms, which is why they are the chosen pair.
- The distinct pattern to avoid is piggybacking flat-rate chat *subscriptions* (the practice
  Anthropic enforced against in Apr 2026). Metered API keys are the permitted pattern.
- Third-party API shapes must be re-verified at implementation time, not written from training
  memory — Gemini's REST surface has already moved to `POST /v1beta/interactions`.
