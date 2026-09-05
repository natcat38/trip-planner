---
name: feedback-upsert-create-update-payload-divergence
description: "An upsert's update payload is rarely safe to reuse as its create payload (or vice versa) — any field the caller defaults to empty on one path will silently erase real data on the other"
metadata:
  node_type: memory
  type: feedback
  originSessionId: 9d02ddb6-0755-4373-abc9-7b2fb429b5cc
  modified: 2026-09-05T00:00:00.000Z
---

Trip-planner's browser extension (Phase 3 M7, 2026-08-20) saves a page via an upsert. The
popup's notes box always starts empty, and the same payload object was passed to both `create`
and `update`. Re-saving a page the user had already annotated from the web app silently erased
notes typed in by hand — no error, no warning, just data loss on the next extension save.

**Why:** the two paths have different natural defaults. A create payload's "no value yet" is
correct; the same "no value yet" reused on an update path means "overwrite with nothing," which
is a different intent that the caller usually didn't mean.

**How to apply:** when writing an upsert, treat the create and update payloads as needing
independent review, not one shared object. Ask specifically: for each field the caller might send
empty/default, does the update path need to preserve the existing value instead of overwriting
it? Prisma's `update: { field: value ?? undefined }` (or a partial update object) is the usual
fix; skip fields entirely rather than sending an empty default.
