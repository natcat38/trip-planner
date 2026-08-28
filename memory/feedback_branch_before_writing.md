---
name: feedback-branch-before-writing
description: "In trip-planner, create the git branch BEFORE writing/committing any file, not after — this repo requires branch->PR->merge for every change including docs"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9d02ddb6-0755-4373-abc9-7b2fb429b5cc
  modified: 2026-08-11T09:21:11.107Z
---

Always run `git checkout -b <branch>` **before** using Write/Edit on any tracked file in this
repo, even a single doc file. Never write-then-branch.

**Why:** During the Phase 2 planning session (2026-08-11), I committed a design-spec file
directly while on `main` twice in a row (once for the design spec, caught and fixed by moving
the commit to a branch after the fact; a near-miss the second time was avoided only by
checking `git status --short --branch` before committing). This repo's branch protection on
`main` (ruleset id 18667574) blocks direct pushes, but a local commit still lands on `main`'s
local history before that protection ever gets a chance to reject it — the mistake is fully
preventable by branching first, not by relying on the remote to catch it after.

**How to apply:** For every doc-only or code change in trip-planner, the very first action is
`git checkout -b <branch-name>`, before any Write/Edit tool call. Only after that, write files,
commit, push, `gh pr create`, wait for checks, merge. This generalizes to any repo with branch
protection on main, not just this one.
