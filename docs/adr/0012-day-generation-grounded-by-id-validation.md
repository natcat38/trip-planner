# ADR-0012: Multi-option day generation is grounded by server-side id validation

**Status:** Accepted (2026-08-20)

## Context
Milestone 4 is the feature the competitive research identified as an actual differentiator: not a
blank chat box, but a short questionnaire producing **2–3 candidate day plans** the user can accept
wholesale or mix between. Nobody else does this — Wanderlog generates one draft and then leaves you
to edit it by hand (handoff §3.10).

It is also the first milestone where a model *selects and orders* things rather than merely
reformatting prose, which puts real pressure on ADR-0008's rule that no user-visible fact may be
model-generated. ADR-0008 was enforced in M3 by a prompt instruction and a test asserting on that
instruction. A prompt is a request, not a guarantee.

Live verification before building (the discipline from ADR-0010/0011) established three things:

1. **Structured JSON output works.** Asking for `{"plans":[{"label":…,"placeIds":[…]}]}` with
   `response_format: {type:'json_object'}` returned exactly that shape, and in testing the model
   introduced no ids outside the supplied list.
2. **Reasoning models spend most of the budget thinking.** Measured: 868 of 957 completion tokens
   went to hidden reasoning, ~89 to the answer. At a small cap the provider returns HTTP 200 with
   `content: null` and `finish_reason: 'length'` — a real answer never arrives.
3. That failure was previously indistinguishable from a provider outage, so the user was told
   "couldn't reach the AI provider" and invited to retry something that would fail identically
   every time.

## Decision
1. **The model returns ids only, and every id is validated server-side against the candidate pool.**
   The response is assembled by mapping surviving ids back to real `Place` rows — never from strings
   the model produced. A hallucinated place cannot reach the user, because there is no code path by
   which model output becomes a rendered place name. This makes ADR-0008 **enforceable** rather than
   merely requested, and it is the core of this milestone.
   - A plan reduced below two valid places is dropped; if no plan survives, the algorithmic path
     runs instead.
2. **Data minimisation.** The model receives `id | name | category` (and `cuisine` when present) —
   public OSM/Wikivoyage facts. It never receives the trip name, dates, budget, collaborator emails,
   or the user's own notes. It is sequencing places; it does not need to know whose trip this is.
   This matters concretely because OpenRouter's `:free` endpoints may train on and publish prompts
   (ADR-0011), so the honest mitigation is to send less, not to add another warning.
3. **A visible notice at generation time** when a `:free` model is selected, so the trade is present
   at the moment it applies rather than only in Settings.
4. **Both paths ship.** With no key — or on any AI failure — an algorithmic path produces candidates
   by proximity clustering and nearest-neighbour ordering. Keyless users are never locked out, and
   this is the same route optimisation Wanderlog charges for.
5. **Candidates are ephemeral.** No table, no migration. Accepting one creates `Activity` rows
   through the existing itinerary code. A refresh loses them; regenerating is a click.
6. **`complete()` distinguishes "no room to answer" from "provider unavailable"** and takes a
   caller-supplied token budget, so day generation can ask for enough headroom for a reasoning
   model and report the real problem when it still isn't enough.

## Consequences
- The grounding guarantee no longer depends on the model's cooperation, the prompt's wording, or
  which model the user picked. Prompt quality now affects only *how good* the plan is, never whether
  it is truthful.
- Generation is only as good as the saved-places tray. Too few saved places returns a friendly
  "save some places first" rather than inviting the model to invent a day, which is the failure mode
  this ADR exists to prevent.
- Ephemeral candidates mean no history and no "restore my last suggestions". Accepted as the cost of
  not adding a table for data whose whole purpose is to be accepted or discarded within one session.
- The algorithmic path is deterministic, so "regenerate" without a key returns the same plans. That
  is deliberate — a reshuffle button that produces different results from identical input would be
  noise, not a feature.
- The `no_room` distinction is user-facing advice ("try a different model"), which means the model
  picker in Settings is now part of the recovery path for a failed generation.
