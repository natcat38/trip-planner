---
name: feedback-verify-plan-assumptions-before-approval
description: "Dispatch verification subagents to falsify a plan's factual assumptions before asking for approval, not after"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 98e2c508-2d90-43fa-ad75-95c874bd6fdd
  modified: 2026-08-19T15:08:40.066Z
---

Before presenting a plan for approval, dispatch subagents to actively **falsify** its factual
claims — external API behaviour, third-party data quality, terms of service, and every assertion
the plan makes about this codebase. Ask them to hunt for the wrong ones, not to confirm.

**Why:** Given 2026-08-19 while planning the Phase 3 research layer. The first plan draft read as
sound and was written from plausible-looking assumptions. Three verification agents falsified
**six** of them, including two that would have shipped as real defects:

- A `/settings` route was assumed to inherit auth. `src/proxy.ts` matches `/trips/:path*` only,
  so a page holding encrypted API keys would have been **publicly accessible**.
- `createActivity` was assumed reusable for a saved place. It has no `lat`/`lng` passthrough, so
  it would have fired a text geocode and could have resolved to a different location.
- OpenStreetMap was assumed to carry an admission `fee` tag. Present on 2.8% of sampled
  attractions, binary only, and zero price data across 83 sampled restaurants.
- Gemini's free tier was assumed viable. Its ToS forbids unpaid use when serving EEA/UK/Swiss
  users — a silent blocker for a Japan/Europe trip planner.

The user rejected the plan twice and asked for verification explicitly: *"trigger other skills to
verify if this plan is accurate. use subagents if needed. i want it properly structured before
executing anything."*

**How to apply:** Between drafting a plan and calling ExitPlanMode, dispatch parallel agents on
independent angles — typically one for external data sources (make real requests, not doc
reading), one adversarially checking every codebase claim against actual code, and one for
provider terms and pricing. Prompt them to report VERIFIED / WRONG per claim with evidence, and
say plainly which claims matter most. Then rewrite the plan around what survives, and keep the
falsified assumptions **in** the document so a later session does not re-propose them. See
[[feedback-subagent-plan-execution]] for the execution half of this, and
[[project-phase1-complete-phase2-next]] for where Phase 3 sits.

Corollary: never write third-party API shapes from training memory. Gemini's REST surface had
moved to `/v1beta/interactions` with `response_format`, and Wikivoyage's `prop=extracts` was not
confirmed enabled — both would have been wrong from recall.
