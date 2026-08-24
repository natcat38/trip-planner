# Pass 1 — Orient (2026-08-24)

**Purpose:** multi-user Japan/Europe trip planner — itinerary, multi-currency budget,
maps, sharing, export, plus Phase 3 research layer (AI day planning, transit, ICS,
weather, offline PWA, attachments, browser extension) and Phase 4 design elevation.
**Audience for this review:** recruiters / hiring managers skimming the repo.

## State

- Repo is at Phase 4 M10 (design elevation, PR #41). CI (`ci.yml`) runs tsc, ESLint,
  Prettier, file-map check, migrate, Vitest, Playwright; deploy job gated behind it
  (ADR-0002). A second workflow (`okf.yml`) validates the `knowledge/` bundle.
- 19 ADRs in `docs/adr/` — genuinely strong signal, well written.
- Hygiene: `coverage/`, `test-results/`, `*.tsbuildinfo` correctly gitignored and untracked.

## Findings

1. **README is two phases stale.** It says "Phases 1 and 2 are functional" and lists
   "What works today" without any Phase 3/4 features (research layer, day planning,
   transit, ICS, weather, offline PWA, attachments, extension, new design). ADR list
   stops at 0007 of 19. "What's not done" items may be stale too. → Docs pass.
2. `docs/phase-3-*-handoff.md` — session handoff docs; likely stale working artifacts
   worth pruning or archiving. `docs/superpowers/{plans,specs}` — working plans; decide
   keep vs prune. → Docs / over-engineering pass (ask user before deleting).
3. No screenshots anywhere in README — recruiter skim test will fail on this.
4. README "Seeing it" says no logged-out landing page / starter page at root — verify
   still true after Phase 4 design work.
