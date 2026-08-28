---
name: feedback-subagent-plan-execution
description: "Plan execution in this repo goes through subagents; the operating rules live in the global CLAUDE.md 'Subagents & Token Economy' section"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 9d02ddb6-0755-4373-abc9-7b2fb429b5cc
  modified: 2026-08-24T00:00:00.000Z
---

Execute approved plans via subagents, not inline. The operating rules — model tiering, scope,
wave scheduling, agent I/O, verification gates, crash recovery — live in **one place**: the
"Subagents & Token Economy" section of the global `~/.claude/CLAUDE.md`, loaded every session.
Don't restate them here.

Repo-specific: prefer `superpowers:subagent-driven-development` over
`superpowers:executing-plans` at the "Execution Handoff" step of `superpowers:writing-plans` —
one subagent per task or small cluster, review between dispatches.

**Why:** Given after Milestone 7 (Maps), when the first 7 milestones had been executed entirely
inline. The token-economy rules were added later, in August 2026, after sessions hit usage
limits mid-milestone.

**How to apply:** Follow the global section; the only thing this memory adds is the
subagent-driven-development skill choice above, and the exception below.

Exception: steps I can't take unilaterally (creating third-party accounts, entering credentials,
provisioning Vercel/Neon) still need direct user interaction regardless of subagent usage.
See [[feedback-verify-plan-assumptions-before-approval]] for the planning half, and
[[feedback-repo-wide-checks-during-multitask-execution]] for what to check mid-execution.
