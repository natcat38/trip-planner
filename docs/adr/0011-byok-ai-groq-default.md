# ADR-0011: BYOK AI layer — Groq default on privacy grounds, OpenRouter second

**Status:** Accepted (2026-08-20)

## Context
ADR-0008 established that no user-visible fact may be model-generated, and ADR-0009 blocked
Gemini's free tier (its ToS bars free-tier API clients serving EEA/UK/CH users, and the app is a
Japan/**Europe** planner). The Phase 3 roadmap therefore planned a BYOK layer — the user supplies
their own metered API key — defaulting to **OpenRouter**, with Groq second.

Re-verifying both providers' live terms before building (the discipline ADR-0010 was written under)
corrected that plan.

### The free-tier privacy trap, which reverses the provider order

OpenRouter's own support documentation states that its free endpoints require permission to train
on and publish prompts:

> Most free endpoints train on, or may publish, the prompts they receive… To use free models, turn
> both on… free endpoints generally require these permissions.

The earlier research pass had recorded the opposite — that the account toggles "must stay off". As
written, that guidance would have silently broken free-model access; taken the other way, it means
the $0 path on OpenRouter costs the user their privacy. **This is the same objection that helped
disqualify Gemini in ADR-0009**: trip data carries hotel names and travel-companion names.

Groq's Services Agreement §4.2 is materially better for the same $0 use:

> Groq is not permitted to use Inputs or Outputs for training or fine-tuning any AI Model Services
> or other models, unless explicitly granted permission or instructed by Customer.

Default is no-training — an opt-in, not a precondition of the free tier. Groq's free tier carries
real chat models (e.g. `openai/gpt-oss-120b`) at published limits.

### Other corrections to the earlier research

- The OpenRouter clause contemplating third-party apps is **§5.1** ("to the extent you incorporate
  the Service into your own products and services"), not §5.2 as recorded. Substance held.
- Groq's §3.1 was cited correctly and does authorize making the service available to end users
  through a "Customer Application".
- Groq contracts EEA and Swiss customers through **Groq UK Limited** (a single UK entity, not a
  separate EU one), with EU SCCs and a UK ICO addendum in its DPA.
- **Neither provider has a Gemini-style geographic gate.** OpenRouter's only geography clause
  (§5.7, "Restricted Models") passes through individual model providers' own restrictions.
- OpenRouter's 1% prompt-logging discount is off by default and must stay off.
- OpenRouter's `HTTP-Referer` / `X-Title` headers are optional attribution, not required.

### Findings the earlier research missed

- **OpenRouter ToS §7** prohibits accessing the service "for purposes of reselling API access to
  Models or otherwise developing a competing service." Strict per-user BYOK does not implicate
  this, but an app-held shared key fanned out across users would.
- **Groq's Services Agreement opens with "Cloud Services and the AI Model Services under this
  Agreement are not for consumer use."** No authoritative source resolves what this restricts:
  it may be a B2B contract posture disclaiming consumer-protection treatment, or it may be read as
  excluding personal use by an individual. Under BYOK each end user is themselves the "Customer",
  so the ambiguity lands on them. **This is recorded as an unresolved risk, not a cleared one** —
  it is the closest analog to the Gemini clause the previous pass missed.
- Groq's docs contradict themselves on which model ids are live: the embedded API schema lists
  models the same page's marketing content calls deprecated. Unresolvable without a live key.

## Decision
1. **Groq is the default provider**, on privacy grounds — reversing the roadmap's order and the
   reason is recorded here so the reversal isn't quietly undone.
2. **OpenRouter is supported as the second provider.** When a user selects an OpenRouter `:free`
   model, the UI states plainly that those endpoints may train on and publish prompts. The app
   never enables that on the user's behalf and never opts into the prompt-logging discount.
3. **Strictly BYOK per user.** No app-held shared key, ever — required by ADR-0001's $0 constraint,
   and independently by OpenRouter §7.
4. **No hardcoded model ids.** The app calls the provider's `/models` endpoint with the user's key
   and offers what actually comes back. This removes the stale-id failure mode entirely rather than
   betting on documentation that is already self-contradictory.
5. **Groq's `compound` models are excluded.** They carry built-in web search and code execution,
   which would let un-vetted web content reach the user as fact — a direct breach of ADR-0008.
6. **Keys are encrypted at rest** with AES-256-GCM via node `crypto` (no new dependency), under a
   new `ENCRYPTION_KEY` env var. Plaintext never returns to the browser; reads yield a mask. A
   failed decrypt (rotated key, tampered row) is treated as "no key stored" and prompts re-entry
   rather than throwing.
7. **`src/proxy.ts`'s matcher was extended to cover `/settings` before that route existed**
   (handoff §3.6). An unmatched route is simply public, and the failure is silent.
8. **The grounding rule is unchanged.** The model reformats and condenses text the app already
   retrieved from Wikivoyage/OSM. It is never a source of facts.

## Consequences
- Users who want the $0 path on OpenRouter must accept training/publication, and are told so in
  plain language before choosing. Groq's free tier avoids that trade, which is why it leads.
- Groq's "not for consumer use" ambiguity is carried knowingly. If it is ever clarified against
  personal use, the default provider must be revisited.
- Because model ids come from the live API, a provider retiring a model degrades to "that model is
  no longer offered" rather than a hard failure on a hardcoded string.
- `ENCRYPTION_KEY` is the project's first secret that is not a third-party credential. Rotating it
  invalidates every stored key — acceptable, since re-entry is a paste, but it must never be
  rotated casually.
- OpenRouter offers an OAuth PKCE flow purpose-built for this pattern, which would be a nicer
  onboarding than pasting a key. It is deliberately deferred: it is OpenRouter-only, and paste
  works uniformly for both providers today.
- Neither provider's success path could be verified before shipping, because BYOK means the
  developer holds no key. Both providers' 401 shapes and OpenRouter's live model list were
  verified; the first real completion happens with a user's own key.

## Addendum (2026-08-24)

In practice the owner could not open a Groq account — the sign-up page would not complete
(tested Aug 2026) — so the provider actually exercised end-to-end in production is
**OpenRouter** ("Summarize this guide" verified working there, 2026-08-20). Groq remains the
documented default in code (`gsk_` prefix detection, provider-neutral model discovery), but its
success path is unverified and its "not for consumer use" clause remains open. If Groq sign-up
remains broken, a future revision may flip the documented default to OpenRouter with the
privacy caveat stated instead.
