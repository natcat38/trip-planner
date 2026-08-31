# Adversarial verification of `docs/ui-ux-audit.md` (2026-08-31)

Method: for each of the 30 findings, (1) opened the cited file/lines and checked the
code matches the claim, (2) checked the cited standard is the right one and applies,
(3) sanity-checked severity. Default verdict on a cite mismatch is REFUTED.

**Totals: 18 CONFIRMED · 9 PARTIALLY CONFIRMED · 3 REFUTED.**

| # | Verdict | Evidence / correction |
|---|---------|-----------------------|
| 1 | CONFIRMED | `ConfirmSubmitButton.tsx:38` is `window.confirm` only; `edit/page.tsx:74-80`, `ItineraryDays.tsx:541-547`, `BudgetPanel.tsx:203-209`, `SharingPanel.tsx:97-115`/`158-165` all match. No `deletedAt`/soft-delete anywhere in `prisma/schema.prisma`; no undo path. Nielsen #3 + #5 correct. Critical justified. |
| 2 | CONFIRMED | `AiKeyPanel.tsx:221-232` — raw `<button type="submit">` with no `disabled`, hand-rolled `onSubmit` confirm; the only `window.confirm` outside `ConfirmSubmitButton` (`grep window.confirm`). Cite `222-231` is off by one line at each end; substance exact. |
| 3 | CONFIRMED | `grep aria-invalid\|aria-describedby src` → **zero hits**. Every form is one top-of-form `role="alert"` (`TripForm.tsx:40-44`, `ActivityForm.tsx:46-50`, `ExpenseForm.tsx:18-22`, `DayNotesForm.tsx:31-35`, `PlaceRow.tsx:116-120`, `DayPlanner.tsx:130-134`, `SharingPanel.tsx:172-176`, `AiKeyPanel.tsx:64-68`). WCAG 3.3.1 (A) correct; note focus-to-first-error is best practice, not an SC requirement. |
| 4 | CONFIRMED | Only `layout.tsx:43-44` (static `'Trip Planner'`) and `shared/[token]/page.tsx:35` `generateMetadata`. No authenticated route sets a title. WCAG 2.4.2 Page Titled, Level A — correct SC and level. |
| 5 | PARTIALLY CONFIRMED — **severity overstated (High → Low/Medium)** | The usage claim is true (`ItineraryDays.tsx:183,298,353,402,425,484,506`, `PlaceRow.tsx:61,77,112,179`, `SharingPanel.tsx:143`, `AppHeader.tsx:22`). But the implied failure is not: light zinc-500 `#71717a` on `--surface #faf9f7` measures **4.56:1** (passes 1.4.3 AA for normal text; the audit's own "~4.6:1, passes by a hair" concedes this), and dark zinc-400 `#a1a1aa` on `--surface #09090b` measures **~7.8:1** — comfortably passing, not a risk. Every site pairs `text-zinc-500 dark:text-zinc-400`, so the dark path is consistent. This is a **tokenization/consistency** gap, not a WCAG 1.4.3 defect; citing 1.4.3 as the driver overstates it. |
| 6 | CONFIRMED | `ItineraryDays.tsx:493-549` — `gap-2` (8px) between two `p-2` chevrons, an inline `text-sm` "Edit" `<Link>` (~20px tall, under the 24px floor) and a `text-sm` Delete. WCAG 2.5.8 Target Size (Minimum), AA in WCAG 2.2 — correct; the 24px-circle spacing exception is not met at 8px gaps. Fitts's Law applies. Medium reasonable. |
| 7 | PARTIALLY CONFIRMED — **wrong Nielsen heuristic; claim overstated** | `edit/page.tsx:72-82` confirmed: delete form directly follows the form with no separation. But it is **not** "visually identical to routine links" — it is `text-danger underline`, i.e. already colour-differentiated. And Nielsen **#6 is "Recognition rather than recall"**, which is not the issue; the right heuristic is **#5 Error prevention** (or #3 User control). Jakob's Law citation is also a stretch. Real but smaller issue: no danger-zone grouping/heading. |
| 8 | CONFIRMED | Nine hand-rolled `disabled={isPending}` submits: `ActivityForm.tsx:146`, `ExpenseForm.tsx:68`, `TripForm.tsx:128`, `DayNotesForm.tsx:47`, `Checklist.tsx:151`, `GuideSummary.tsx:29-35`, `DayPlanner.tsx:117` and `:230`, `PlaceRow.tsx:182`, `AiKeyPanel.tsx:118` and `:211`. `SubmitButton.tsx:59` is what supplies `aria-busy`. Minor cite error: the "places search" item is actually `places/page.tsx:435`, a Save button with **no** pending guard at all — worse than described, not the same bug. |
| 9 | PARTIALLY CONFIRMED — **rationale half-stale** | `grep touch-action\|touch-manipulation` → zero hits; `Map.tsx:103-114` sets no `touch-action`. But the "tap delay" half is obsolete: `layout.tsx:54` exports a `Viewport`, and Next's default `width=device-width, initial-scale=1` already removes the 300ms delay in every current mobile browser. Only the accidental double-tap-zoom argument survives. Low, not Medium. |
| 10 | **REFUTED** | The copy is already exactly what the audit asks for: `src/server/errors.ts:5` — `'This trip was changed elsewhere — reload and try again.'` — surfaced through `withFormErrors(..., [StaleWriteError])` at `trips/[id]/actions.ts:163,244` and rendered in each form's `role="alert"`. The finding's own instruction was "verify actual copy"; verified, and it disproves the claim. |
| 11 | CONFIRMED | `error.tsx:37-39` renders `{error.message || 'An unexpected error occurred.'}` verbatim. Nielsen #9 correct. Medium reasonable (Next.js redacts server-side messages to a digest in production, so the real exposure is client-render errors — worth noting). |
| 12 | CONFIRMED | `BudgetPanel.tsx:193-195` (label span in a `1fr auto auto` grid, no `min-w-0`/`truncate`), `Checklist.tsx:75-83`, `ItineraryDays.tsx:351-353`, `trips/page.tsx:109-111`; contrast `PlaceRow.tsx:58-59`, which does apply `min-w-0 ... truncate`. Low-Medium; these are wrapping blocks, so the failure mode is ugly wrapping rather than overflow. |
| 13 | PARTIALLY CONFIRMED — **WCAG 1.4.1 does not apply** | `ItineraryDays.tsx:433-447` — bare `<summary>` with an `aria-hidden` circle and `sr-only "Pin colour"`, no visible affordance; `:461` `aria-label={`Set pin colour ${color}`}` is the raw hex. Both true. But 1.4.1 Use of Color is about information conveyed by colour alone, and each swatch **has** a programmatic text label — this is a naming/comprehension issue (Nielsen #2 Match with the real world / #6 recognition), not 1.4.1 even "in spirit". |
| 14 | PARTIALLY CONFIRMED — **one of four cites is wrong** | `ActivityForm.tsx:123-131`, `ExpenseForm.tsx:58-66` and `PlaceRow.tsx:168-176` are `placeholder="Currency"`, `maxLength={3}`, no pattern. But **`TripForm.tsx:100-109` already uses `placeholder="JPY"`** — it is the example the finding asks for, not an instance of the defect. |
| 15 | CONFIRMED | `SharingPanel.tsx:23-48` — `setStatus('error')` only changes the button's own text; no `aria-live`, and the error state never auto-clears (unlike `copied`). Low/Medium fine. |
| 16 | CONFIRMED | `grep beforeunload src` → zero hits; `TripForm`/`ActivityForm` are uncontrolled `defaultValue` forms with no dirty tracking. WIG Forms fits. |
| 17 | PARTIALLY CONFIRMED — **heuristic is a loose fit** | `DayPlanner.tsx:156-160` verbatim as quoted; no link to create days. But this is an empty/blocked state, not an error message, so Nielsen **#9** (recognize/diagnose/**recover from errors**) is a stretch; #1 Visibility of system status or plain "no next action" is the better frame. Issue itself is real. |
| 18 | CONFIRMED | `SharingPanel.tsx:97-115` — regenerate/revoke confirms name the consequence but nothing shows link age, creation time, or access count; `ShareStatus` carries no such data. Nielsen #1 correct. Low-Medium. |
| 19 | CONFIRMED | Of every `underline` class in `src/app`, **zero** are paired with a `hover:` (`grep underline \| grep -c hover` → 0). `globals.css:132-139` transitions colour but no rule ever changes it. Sites include `trips/page.tsx:69,89,145`, `ItineraryDays.tsx:530`, `PlaceRow.tsx:112,196`, `error.tsx:50`. |
| 20 | CONFIRMED | `ItineraryDays.tsx:336-340` — selection is `border-accent` vs `border-border` and nothing else; no `aria-current`, no text cue. WCAG 1.4.1 Use of Color (Level A) is the correct SC here. |
| 21 | PARTIALLY CONFIRMED — **the "no keyboard pan/zoom" claim is wrong** | `Map.tsx:78-90` genuinely never calls `addControl(new NavigationControl())`. But Mapbox GL JS enables its `keyboard` handler by default and gives the canvas `tabindex="0"` — arrow-key pan and `+`/`-` zoom already work. So it is a **missing visible zoom control**, not a keyboard-operability gap; WCAG 2.1.1 is not engaged at all (the audit's "satisfied via alternative" understates how satisfied it is). |
| 22 | CONFIRMED | `ItineraryDays.tsx:203-210` — `target="_blank"` with no icon or "(opens in a new tab)". WCAG 3.2.5 Change on Request is correctly identified as **AAA**, so correctly ranked Low. |
| 23 | CONFIRMED | `grep '<nav' src` → exactly one hit, `trips/[id]/page.tsx:96`. Comparable clusters (`trips/page.tsx:66-79`, `error.tsx:40-54`) are plain divs. Correctly framed as 1.3.1 best practice rather than a failure. |
| 24 | CONFIRMED | `ItineraryDays.tsx:416-430` — pressed state is `border-accent text-accent` only; `aria-pressed` (`:418`) and the count do mitigate. No principle cited, and none is needed. Low correct. |
| 25 | PARTIALLY CONFIRMED — **wrong UX law** | `trips/page.tsx:66-72` confirmed as the sole Settings entry; `AppHeader.tsx` carries only email/theme/sign-out. But Jakob's Law is about cross-site expectations; the applicable principle is Nielsen #3 (user control and freedom) / #4 consistency — persistent nav. |
| 26 | CONFIRMED | `TripForm.tsx:57-68` — free-text `destinations` with a "(comma-separated)" label and no tokenizer or suggestions. Recognition-over-recall (Nielsen #6) is the right frame; Low correct. |
| 27 | CONFIRMED | `ItineraryDays.tsx:321` (`day.activities.length > 0 &&`) and `BudgetPanel.tsx:189` (`expenses.length > 0 &&`) both render nothing in the zero case, with no `else`. |
| 28 | CONFIRMED | `DayPlanner.tsx:130-134` verbatim: `{state.error} Save more places in the tray below and try again.` — appended unconditionally, including to stale-write and provider-outage errors. |
| 29 | CONFIRMED | `Attachments.tsx:112-117` — `SubmitButton pendingLabel="Uploading…"`, no `XMLHttpRequest.upload.onprogress` or `<progress>` anywhere in the file. Low correct. |
| 30 | **REFUTED** | `overscroll-behavior` is indeed absent (`grep overscroll src` → zero hits), but it is a **no-op for the cited element**: the `<details>` colour popover (`ItineraryDays.tsx:448`) is `flex ... p-2` with no `overflow` and no height constraint — it never scrolls, so there is no scroll chain to contain. The finding is also the only one in the list with no file cite. |

## Cross-cutting corrections

1. **#10 is factually wrong** and should be struck: the "changed by someone else — reload"
   copy the finding recommends is already the literal `StaleWriteError` message
   (`src/server/errors.ts:5`).
2. **#30 is inapplicable** — `overscroll-behavior` on a non-scrolling popover does nothing.
3. **#21 misstates Mapbox behaviour** — keyboard pan/zoom is on by default; reword to
   "no visible zoom control" and drop the 2.1.1 reference.
4. **Wrong-principle citations even where the issue is real:** #7 (Nielsen #6 → should be
   #5), #13 (WCAG 1.4.1 does not apply — the swatches have text labels), #17 (Nielsen #9 →
   an empty state, not an error), #25 (Jakob's Law → Nielsen #3/#4).
5. **#5's severity is the biggest ranking error.** Both muted-text pairings were measured
   during this verification and pass AA (4.56:1 light, ~7.8:1 dark). It belongs in Low as a
   token-consistency item, not in High as a WCAG 1.4.3 item.
6. **#14 partly self-refutes** — `TripForm` already ships the `placeholder="JPY"` fix.
7. Cites are otherwise accurate to within a line or two; #2 (`222-231` vs `221-232`) and
   #1 (`SharingPanel 97-165`, which spans two separate control groups) are the loosest.
   No finding was refuted for a bad cite alone.
8. The "already done well" section checks out: skip link, `prefers-reduced-motion`
   (`globals.css:141-147`, `Map.tsx:161-168`), measured `--border-strong`/`--accent`
   tokens with contrast figures in comments, real-`<button>` map pins with `aria-label`
   (`Map.tsx:103-105`), unconditionally-mounted `aria-live` (`DayPlanner.tsx:129`),
   native checkbox checklist, `aria-pressed` votes, `PlaceRow` truncation.
