# ADR-0007: Itinerary export uses browser print-to-PDF, not server-generated PDF

**Status:** Accepted (2026-08-11)

## Context
Phase 2 export (Product Scope §6) asks for exporting an itinerary to PDF. The obvious
server-side approach — a library like `@react-pdf/renderer`, or headless Chrome (Puppeteer)
rendering the existing itinerary markup — produces a literal downloadable file, but headless
Chrome doesn't fit Vercel's serverless functions without either a paid plan (for the memory/
execution-time headroom it needs) or a separate rendering service, both of which conflict with
ADR-0001's $0/month constraint. A pure-layout library like `@react-pdf/renderer` avoids that
cost but requires maintaining a second, PDF-specific layout system parallel to the existing web
UI, for a Phase-2 nice-to-have.

## Decision
Export is a dedicated print-friendly page (`/trips/[id]/print`) with a print stylesheet; an
"Export PDF" button calls the browser's native `window.print()`, and the user saves via their
browser's own print-to-PDF. No server-side PDF generation exists anywhere in the app.

## Consequences
- Zero added cost and zero new dependencies — fits ADR-0001 exactly.
- No literal "download" action server-side; the PDF is produced entirely client-side by the
  browser. This is a deliberate trade of a slightly less polished export flow for staying
  inside the $0/month constraint — not an oversight, so a future "just add react-pdf"
  suggestion should be weighed against this reasoning, not treated as an obvious improvement.
- If future requirements need a literal server-generated file (e.g. emailing a PDF, or an API
  consumer that isn't a browser), this decision would need revisiting alongside ADR-0001's
  cost constraint, not swapped in isolation.
