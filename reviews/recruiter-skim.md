# Pass 7 — Recruiter skim test (90 seconds as a hiring manager)

## What lands well now

- **First screen sells:** honest status line, a real feature list, and a hero screenshot of
  the itinerary + synced map from seeded data. The "no logged-out landing page" caveat is gone
  (there is a real landing page since Phase 4).
- **The ADR section is the differentiator.** Nineteen ADRs with live-verified provider terms
  (ADR-0011), a grounding rule made structural (ADR-0012), and candid open risks read as
  senior judgment, not tutorial-following.
- **"What's not done" builds trust** — attachments-at-rest encryption and the Groq clause are
  stated plainly instead of hidden.
- **CI story is credible:** full gate + gated deploys + a second workflow validating the
  knowledge bundle; okf action now SHA-pinned.

## Remaining gaps, ranked by impact

1. **GitHub About block** (description / website / topics) — not verifiable locally; set it
   manually. Suggested description: "Multi-user trip planner — itinerary, multi-currency
   budget, synced maps, grounded research, offline PWA. Next.js 16 / Prisma 7 / Postgres."
2. **~3,300 lines of stale planning docs** (docs/phase-3-*-handoff.md, docs/superpowers/) —
   deletion needs owner sign-off; they read as working scratch, not portfolio material.
3. **No dark-mode screenshot** — the theme toggle is a Phase 4 feature; one dark capture of
   the itinerary would show it. Minor.
4. **Live demo link** — the shared-trip URL of a seeded prod trip could go in the README
   "Seeing it" section so a recruiter clicks straight into the product. Needs the prod URL.
