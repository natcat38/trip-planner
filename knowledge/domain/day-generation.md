---
type: Domain Entity
title: Day generation
description: Guided multi-option day plans — 2-3 candidate days built from the saved-places tray, grounded by server-side id validation.
resource: ../../docs/adr/0012-day-generation-grounded-by-id-validation.md
tags: [domain, ai, research]
timestamp: 2026-08-20T00:00:00Z
---

# Schema

The differentiator: a short **questionnaire** (focus categories + pace), not a chat box, producing
**2–3 candidate day plans** from the trip's [saved places](/domain/places.md). Accept one and its
places become [activities](/domain/itinerary.md) on a chosen day.

Candidates are **ephemeral** — no table, no migration. They exist for the session; accepting one
creates real rows through the existing itinerary code.

Two paths, both shipping:

- **AI** ([BYOK](/integrations/byok-ai.md)) — the model selects and sequences.
- **Algorithmic** (`src/lib/dayPlan/algorithmic.ts`) — proximity clustering + nearest-neighbour
  ordering, deterministic. Runs when there's no key or the AI path fails, so keyless users are never
  locked out. This is the same route optimisation Wanderlog charges for.

⚠️ **The grounding rule is enforced, not requested.** The model returns **ids only**, and every id is
validated server-side against the saved-places pool; the response is built by mapping surviving ids
back to real `Place` rows. A hallucinated place has no code path to the screen, whatever the prompt
says or whichever model the user picked — see
[ADR-0012](../../docs/adr/0012-day-generation-grounded-by-id-validation.md). A plan left with fewer
than two valid places is dropped; if none survive, the algorithmic path runs.

**Data minimisation:** the model receives `id | name | category` (+ `cuisine`) — public OSM/Wikivoyage
facts. Never the trip name, dates, budget, collaborator emails, or the user's notes. It sequences
places; it doesn't need to know whose trip it is. A visible notice appears at generation time when a
free OpenRouter model is selected, since those endpoints may train on and publish prompts.

Generation happens **only on explicit user action** — it spends the user's own quota.

# Citations

[ADR-0012](../../docs/adr/0012-day-generation-grounded-by-id-validation.md),
[ADR-0008](../../docs/adr/0008-grounded-research-no-generative-layer.md),
[Phase 3 handoff §8, §3.10](../../docs/phase-3-research-layer-handoff.md).
