# UI/UX Audit — Ranked Findings (2026-08-31)

Three parallel audits: WCAG 2.2 AA, Vercel Web Interface Guidelines, and UX
heuristics/laws (Nielsen, Fitts, Hick, Jakob, Doherty, Postel). Findings below
are merged, deduplicated, and ranked descending by priority (severity ×
frequency × blast radius). Standards cited per item.

Every claim was adversarially re-verified against the code
(`docs/ui-ux-audit-verification.md`): 18 confirmed, 9 corrected in place,
3 refuted and removed/downgraded. Numbering keeps v1 ids, so #5 and #10 are
intentionally absent (refuted: muted-text contrast measures AA-passing — now
tracked as polish in #30; stale-write conflict copy already exists in
`src/server/errors.ts:5`).

## Critical

1. **No undo/soft-delete anywhere; `window.confirm` is the only guard on all destructive actions.**
   Trip deletion cascades (days, activities, expenses, attachments) irreversibly.
   `src/components/ConfirmSubmitButton.tsx`, `src/app/trips/[id]/edit/page.tsx:74-80`,
   `ItineraryDays.tsx:541-547`, `BudgetPanel.tsx:203-209`, `SharingPanel.tsx:97-165`.
   *Nielsen #3 (undo) & #5 (error prevention).* Fix: undo toast for single-item
   deletes; type-to-confirm for whole-trip deletion.

2. **Settings "Remove key" has no pending/disabled guard — double-submit on a destructive action**, and it hand-rolls `window.confirm` instead of using `ConfirmSubmitButton`.
   `src/app/settings/AiKeyPanel.tsx:222-231`. *WIG forms/destructive-action safety.*

## High

3. **Systemic: no inline per-field errors and no focus-to-first-error on submit** — every form uses one top-of-form `role="alert"` banner; fields lack `aria-invalid`/`aria-describedby` and the message rarely names the field.
   TripForm, ActivityForm, ExpenseForm, DayNotesForm, PlaceRow edit, DayPlanner,
   SharingPanel invite, AiKeyPanel. *WCAG 3.3.1; Nielsen #9; WIG Forms.* Biggest
   single systematic gap in the app.

4. **Per-page `<title>` missing on almost every authenticated route** — trips list, trip detail, edit, new, places, activity edit, settings, print all show generic "Trip Planner".
   *WCAG 2.4.2 (Level A).* Server Components — trivially fixed with `generateMetadata`.

## Medium

6. **Delete/Edit/Move packed into cramped adjacent tap targets on activity rows** — destructive Delete one mis-tap from Edit on mobile. `ItineraryDays.tsx:493-549`. *Fitts's Law; WCAG 2.5.8 adjacency.* Add spacing or a kebab menu on small screens.

7. **"Delete trip" sits directly under "Save changes" with no danger-zone separation** — it is styled `text-danger` (so not colour-identical), but carries the same visual weight as routine links and no structural isolation. `edit/page.tsx:72-82`. *Nielsen #5 (error prevention); Jakob's Law.* Cheap, high-leverage while #1 is pending.

8. **~10 hand-rolled `disabled={isPending}` submit buttons instead of the shared `<SubmitButton>`** — lose `aria-busy` and consistency for free. ActivityForm, ExpenseForm, TripForm, DayNotesForm, Checklist, GuideSummary, DayPlanner, PlaceRow, AiKeyPanel, places search. *WIG consistency.*

9. **No `touch-action: manipulation` anywhere** — 24px pin swatches, chevrons, and map markers risk double-tap-zoom/tap delay on mobile. `globals.css`, `Map.tsx:103-114`, `ItineraryDays.tsx`. *WIG Touch.* One global rule fixes it.

11. **`error.tsx` shows raw `error.message` to end users** — leaks implementation detail, rarely actionable. `src/app/error.tsx:37-39`. *Nielsen #9.*

12. **Long user text unguarded in several rows** (expense labels `BudgetPanel.tsx:190-213`, checklist items `Checklist.tsx:82`, activity titles `ItineraryDays.tsx:351-353`, trip names `trips/page.tsx:108-121`) — missing `min-w-0`/`truncate` that PlaceRow already applies. *WIG Content Handling.*

13. **Pin-colour picker is undiscoverable and hex-only-labelled** — a plain circle with `sr-only` text (no affordance), swatch labels say "#dc2626" not "red". `ItineraryDays.tsx:433-489`. *Nielsen #6.* (Not a WCAG 1.4.1 issue — swatches do carry text labels.)

14. **Currency inputs are free text with no example hint or client validation** — "Currency" placeholder, `maxLength=3` only. ActivityForm, ExpenseForm, PlaceRow (TripForm already shows a "JPY" example placeholder). *WIG Forms.* Placeholder "e.g. JPY" minimum; shared field ideal.

15. **Copy-share-link failure state isn't announced** (button text changes only, no aria-live). `SharingPanel.tsx:36-49`. *WIG a11y.*

16. **No unsaved-changes warning on create/edit forms** — back-nav silently loses a part-filled form. TripForm, ActivityForm. *WIG Forms.*

17. **DayPlanner "no days yet" message states the blocker without a path to fix it.** `DayPlanner.tsx:156-160`. *Empty-state guidance (Nielsen #1/#6), not an error message.*

18. **Share-link revocation: no visibility into who holds the link before revoking.** `SharingPanel.tsx:97-114`. *Nielsen #1.*

## Low

19. Underlined text links across most pages have no `hover:` treatment (systemic, ~15 sites). *WIG Hover States.* One shared class fixes it.
20. Selected activity row signalled by border color only — no `aria-current`/text cue. `ItineraryDays.tsx:336-340`. *WCAG 1.4.1.*
21. Map lacks a visible zoom control (`NavigationControl` not added) — Mapbox keyboard pan/zoom is on by default, so this is a discoverability nicety, not a WCAG 2.1.1 issue. `Map.tsx:78-90`.
22. Weather attribution opens a new tab with no cue. `ItineraryDays.tsx:203-210`. *WCAG 3.2.5 (AAA).*
23. `<nav>` landmark used on only one page; comparable link clusters elsewhere are plain divs. *WCAG 1.3.1 best practice.*
24. Vote-button pressed state is visually subtle (border/text color only); `aria-pressed` + count mitigate. `ItineraryDays.tsx:416-430`.
25. Settings reachable only from the trips-list header — no persistent nav or breadcrumb from inside a trip. `trips/page.tsx:66-72`. *Nielsen #3/#4.*
26. Destinations field is raw comma-separated text (recall over recognition). `TripForm.tsx:61-67`.
27. Empty states missing for per-day activities and zero-expense budget. `ItineraryDays.tsx`, `BudgetPanel.tsx`.
28. DayPlanner appends "Save more places…" advice to every error regardless of cause. `DayPlanner.tsx:130-134`.
29. No upload progress beyond "Uploading…" for large attachments. `Attachments.tsx`.
30. Muted `text-zinc-500/400` isn't in the measured contrast-token system — verified passing 1.4.3 AA in both modes (4.56:1 light, ~7.8:1 dark), so this is token-consistency polish only: a `--muted-fg` token would keep the guarantee explicit.

## Already done well (don't regress)

Skip link, `prefers-reduced-motion` (CSS + map flyTo), measured border/accent
contrast tokens, real-`<button>` map pins with labels, unconditionally-mounted
`aria-live` regions on async forms, native checkbox checklist, `aria-pressed`
vote buttons, PlaceRow truncation, good empty state on trips list, and the
DayPlanner privacy disclosure.

## Source reports

Full per-audit detail was produced in session scratchpad files
(`a11y-report.md`, `wig-report.md`, `ux-report.md`); this document is the
merged, deduplicated ranking.
