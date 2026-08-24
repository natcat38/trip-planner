# Docs pass — repo-review branch

## What changed

- **README.md** — full rewrite, same voice/structure. Status moved from "Phases 1-2" to
  "Phases 1-3 done, Phase 4 open-items/UI/design-elevation closed." Added: research layer,
  BYOK AI day planning, weather, ICS export, duplication, QoL pack (checklists/notes/votes/pin
  colours/theme), offline PWA, attachments, browser extension, sign-out. Added ADR-0008,
  0011, 0012, 0016, 0019 to "Decisions worth reading" (kept 0001/0003 from before, dropped
  0002/0005/0006/0007 from the curated list to keep it short — still linkable via `docs/adr/`).
  Stack list updated (Prisma 7, `@prisma/adapter-pg`, no new deps for crypto/ICS/MIME-sniffing).
  Tests/CI section now mentions `okf.yml` and the `node:vm` sw.js test technique. Verified and
  removed two stale "not done" items: root page is no longer the starter page (real landing page
  exists, `src/app/page.tsx`), and a sign-out control now exists (ADR-0018 §4). Kept/confirmed:
  invites still undelivered (no email-sending code found), no drag-and-drop (move up/down only),
  attachments unencrypted (ADR-0016 §4), Groq consumer-use clause unresolved (ADR-0011). Added a
  screenshots placeholder section — confirmed no screenshots exist in `public/` (only PWA icons +
  sw.js) or `docs/`.
- **knowledge/infra/ecs-fargate.md**, **terraform.md** — reworded "deferred to post-ship" (which
  read as imminent) to "planned, not deployed" and clarified the _actual_ production path
  (Vercel + Neon + gated Actions pipeline) is live now, not deferred. Minimal diffs.
- **knowledge/index.md** — top summary corrected: it previously stated outright that the app
  "deployed to AWS (ECS Fargate + RDS)" — factually wrong (never deployed there). Now states
  Vercel+Neon as the real deployment and AWS/Terraform as planned-not-built.

## Verified, not changed

- `docs/deploy-setup.md` — accurate, matches `ci.yml`/`vercel.json` as they exist. No edit.
- `FILE-MAP.md` — `npm run file-map:check` passes; auto-generated and current. No edit.

## Flagged for user decision (not deleted)

- `docs/phase-3-open-items-handoff.md` (349 lines), `docs/phase-3-research-layer-handoff.md`
  (755 lines) — both self-describe as historical/superseded ("Phase 3 is complete"). Candidates
  for archival or deletion now that ADRs 0008-0018 capture the durable decisions.
- `docs/superpowers/plans/*.md` (~3,210 lines: 374 + 2,264 + 570) and
  `docs/superpowers/specs/*.md` (102 lines) — flagged by the over-engineering audit as
  planning-artifact bloat, not reference docs. `2026-08-11-phase2-sharing.md` (2,264 lines) is
  the single largest file in the repo's docs tree.

## Could not verify

- Whether `ENCRYPTION_KEY` / OAuth secrets are actually set/rotated in the live Vercel project
  (per `docs/phase-3-open-items-handoff.md` §1) — that's account-side state, not inspectable
  from the repo.
- Whether `knowledge/domain/` and `knowledge/integrations/` should gain new pages for
  offline/attachments/extension/ICS/duplication/QoL — none exist today (confirmed via grep) but
  adding them is new documentation, not drift-fixing, so left out of this pass's scope.

No files deleted. No src/ or extension/ code touched. Not committed.
