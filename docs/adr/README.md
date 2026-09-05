# ADR index

One line per decision, in order. See the main [README](../../README.md#decisions-worth-reading)
for a curated subset with more context.

| ADR | Title |
|-----|-------|
| [0001](0001-deploy-vercel-neon-defer-aws.md) | Deploy on Vercel + Neon; defer AWS to post-ship |
| [0002](0002-gated-deploys-via-actions.md) | Gated deploys — GitHub Actions owns the release |
| [0003](0003-optimistic-locking.md) | Optimistic locking from day one |
| [0004](0004-provider-choices.md) | Provider choices — exchangerate-api.com FX + Google & GitHub OAuth |
| [0005](0005-additive-day-generation.md) | Day generation is additive-only, never destructive |
| [0006](0006-collaborator-matched-by-email.md) | TripCollaborator is matched by email, not a User foreign key |
| [0007](0007-export-via-browser-print.md) | Itinerary export uses browser print-to-PDF, not server-generated PDF |
| [0008](0008-grounded-research-no-generative-layer.md) | Destination research is grounded in OSM + Wikivoyage, with no generative layer in v1 |
| [0009](0009-gemini-free-tier-unusable-eea.md) | Gemini's free tier is unusable for this app; a BYOK AI layer defaults to OpenRouter (superseded by ADR-0011: Groq default) |
| [0010](0010-transitous-for-transit-routing.md) | Transitous for transit routing; self-throttled in lieu of prior contact |
| [0011](0011-byok-ai-groq-default.md) | BYOK AI layer — Groq default on privacy grounds, OpenRouter second |
| [0012](0012-day-generation-grounded-by-id-validation.md) | Multi-option day generation is grounded by server-side id validation |
| [0013](0013-qol-pack-ics-duplication-weather.md) | ICS export, trip duplication, and honest weather fallback |
| [0014](0014-qol-pack-part-two.md) | Checklists, day notes, votes, pin colours, and a theme toggle |
| [0015](0015-offline-pwa-html-cache-no-map-tiles.md) | Offline as a cache of visited pages, with no map tiles |
| [0016](0016-attachments-in-postgres-bytea.md) | Trip attachments as Postgres `bytea`, with caps set by the free tier |
| [0017](0017-browser-extension-token-auth.md) | The browser extension authenticates with a token, and geocodes server-side |
| [0018](0018-shared-trips-listing-and-phase-4-dispositions.md) | Shared trips are listable, and two Phase 3 open items stay closed |
| [0019](0019-visual-design-direction.md) | Visual design direction — "departure board" |
