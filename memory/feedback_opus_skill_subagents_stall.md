---
name: opus-skill-subagents-stall
description: "Opus subagents running heavy design skills stalled repeatedly (600s watchdog); resume via SendMessage or relaunch with \"work incrementally\" instruction"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 13372b77-09a7-454c-a1a8-cfd2c889aaf8
  modified: 2026-08-20T15:20:44.069Z
---

On 2026-08-20, three Opus subagent runs invoking large design skills (frontend-design ×2, ui-ux-pro-max ×1) stalled with "no progress for 600s (stream watchdog did not recover)", typically right after announcing they would load the skill. A same-model agent running web-design-guidelines completed fine.

**Why:** Heavy skill loads seem to trigger long tool-call-free stretches that trip the stream watchdog.

**How to apply:** When dispatching Opus subagents with big skills, include "work incrementally — keep making tool calls, don't spend long stretches without one" in the prompt. If a stall notification arrives, SendMessage to the same agent id resumes it with context intact (worked twice); a fresh relaunch also works. Don't assume the run is lost — the transcript survives.
