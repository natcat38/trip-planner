---
name: feedback-stacked-pr-squash-merge-recovery
description: "Merging a base PR by squash deletes its branch, which auto-closes any PR stacked on top and leaves that PR's branch carrying pre-squash commits — recover by rebasing the stacked branch onto the new main tip and opening a new PR"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9d02ddb6-0755-4373-abc9-7b2fb429b5cc
  modified: 2026-09-05T00:00:00.000Z
---

Hit in trip-planner's Phase 3 M5 (2026-08-20, PRs #33/#34/#35): PR #34 was stacked on PR #33.
Squash-merging #33 deletes its branch on GitHub, which auto-closed #34 (its base branch was
gone) and left #34's branch still holding the pre-squash commits — a closed PR whose base
branch no longer exists cannot be reopened or retargeted.

**Why:** a squash merge rewrites the base branch's history into one commit on `main` and deletes
the source branch; GitHub treats "base branch deleted" as grounds to auto-close anything stacked
on it, regardless of whether the stacked PR's own commits are still fine.

**How to apply:** before merging a base PR that has something stacked on it, capture the base
branch's tip SHA. After the squash merge auto-closes the stacked PR, run
`git rebase --onto origin/main <base-tip-sha> <stacked-branch>`, force-push that branch, and open
a **new** PR from it (the old one is unrecoverable). Better still, avoid the situation: merge
stacked PRs in dependency order without gaps, or don't stack when a squash-merge workflow is in
use.
