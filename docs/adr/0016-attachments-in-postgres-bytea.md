# ADR-0016: Trip attachments as Postgres `bytea`, with caps set by the free tier

**Status:** Accepted (2026-08-20)

## Context
Milestone 6's second half (handoff §8): somewhere to keep the paperwork of a trip — booking
confirmations, tickets, screenshots — beside the trip itself. The storage choice was already taken
(handoff §4: "Postgres `bytea` + per-file cap + per-trip total cap"). Re-verifying the platform
before building did not overturn it, but it did establish the numbers, which the original decision
was made without.

## Decisions

### 1. `bytea`, confirmed — but the caps are set by two external ceilings
- **Vercel rejects any function request _or response_ body over 4.5 MB** with a 413. That bounds a
  single attachment from both directions regardless of what this app permits, so **4 MB per file**
  leaves room for the multipart boundaries and part headers a form upload adds on top.
- **Neon's free plan allows 0.5 GB for the entire database** — trips, days, activities, expenses
  and attachments together. A generous per-trip allowance would let a handful of trips exhaust the
  whole project, so **20 MB per trip**, sized for a few confirmations and tickets rather than for
  what a file picker makes it easy to select.

Vercel Blob was considered and rejected for now: free on Hobby and it would keep files off Neon's
0.5 GB, but it is a new service needing its own auth for private delivery, and exceeding the Hobby
allowance locks Blob out for 30 days. If the 0.5 GB ever becomes the binding constraint, that is
the escape hatch — the interface in `src/server/attachments.ts` is where it would change.

Next's `serverActions.bodySizeLimit` is raised to 4.5 MB in `next.config.ts`; the 1 MB default
would reject a legitimate upload before the action ran.

### 2. The content type is read from the bytes, never from the upload
A browser sends whatever content type the client claims. `sniffMimeType` inspects the leading bytes
against four signatures (JPEG, PNG, WebP, PDF) and **the sniffed type is what gets stored** — the
declared type is discarded entirely rather than compared. Anything unrecognised is rejected.

The reason is that these bytes are later served back **from this app's own origin**. An uploaded
`text/html` echoed with its declared type would be same-origin script — stored XSS against every
collaborator on the trip. So the download route additionally:

- serves only a type re-checked against the allowlist on read,
- sets `X-Content-Type-Options: nosniff` so a browser can't overrule it,
- sets `Content-Disposition: attachment` — nothing here needs to render in a top-level browsing
  context,
- sets `Cache-Control: private, no-store`, since these are private documents behind an auth check.

Any one of those four would probably do. They are cheap, and the failure mode is not.

### 3. Attachments are never on `/shared/[token]`
The public share route is the one read path with no auth gate, and a booking confirmation is
precisely the document that must not be readable by anyone holding a link. This is structural —
`getSharedTrip`'s include simply doesn't reach `Trip.attachments` — and `sharing.db.test.ts`
asserts the payload rather than a filter, so widening that include fails the suite.

Duplication doesn't copy them either. A confirmation is a record of the *original* trip, not a
template for planning a new one (the reasoning that keeps votes out, ADR-0014), and copying would
duplicate every byte against a 0.5 GB budget.

### 4. No identity documents, and the UI says so
Attachments are stored unencrypted. `src/lib/crypto.ts` exists (M3, for provider API keys) and
could be applied here, but encrypting the column means a key-rotation story for data that is
useless once lost — a decision worth its own milestone, not a footnote in this one.

Until then the panel says plainly that passports and ID don't belong here, rather than leaving the
user to assume something the storage doesn't do.

### 5. `listAttachments` never selects `data`
An explicit `select` omitting the file bodies, which is also why `AttachmentSummary` is written out
by hand instead of inferred. Rendering a list of filenames must not pull megabytes of `bytea` into
a serverless function's memory. Tested directly.

### 6. Not a `'use server'` module
Same reasoning as `src/server/aiSettings.ts`: that directive publishes every export as a public HTTP
endpoint, and `readAttachment` returns raw file bytes. Everything is behind `requireTripAccess`
either way, so this is about not creating surface nothing needs — the Server Actions live in
`src/app/trips/[id]/actions.ts`, and the download route imports this module directly.

### 7. The e2e test drives a real upload over HTTP
`e2e/attachments.spec.ts` signs in the way `export.spec.ts`, `places.spec.ts` and `settings.spec.ts`
already do — writing an Auth.js session row into Postgres and setting its cookie, rather than
clicking through a real OAuth provider (this repo has no test account; see `e2e/sharing.spec.ts`).

That is worth doing here rather than trusting the unit tests, because the upload path crosses three
things no unit test reaches: the Server Action body limit, the `bytea` round trip, and the response
headers above. The test asserts all three against real HTTP.

Note the sign-in preamble is now duplicated across five specs. Extracting it into an `e2e/` helper is
worth doing, but as its own change rather than inside this one.

## Consequences
- The per-trip cap is enforced with a read-then-insert, so two uploads racing can both pass and land
  slightly over. The cost is a few megabytes; a serialisable transaction per upload would buy
  precision nobody is measuring.
- Attachments count against the same 0.5 GB as all trip data. If that becomes binding, either the
  caps come down or storage moves to Blob — there is no third option on the free tier.
- Adding a fifth accepted format means adding a signature, not relaxing a check. That is deliberate:
  there is no path to accepting a file whose bytes weren't recognised.
