# Design & UI Audit — vs. ADR-0019 "departure board"

Scope: `src/app` + `src/components`, checked against `docs/adr/0019-visual-design-direction.md`,
Vercel Web Interface Guidelines, and Hallmark anti-slop gates. Code-level only, no browser run.

## Critical

1. **Page background never adopted the warm-neutral `--surface` token — 16 files still hardcode
   cool-neutral `bg-zinc-50 dark:bg-zinc-950`.** ADR-0019 §1's whole premise is "warm-neutral ink/
   paper" (`#faf9f7` / `#09090b`) replacing the starter's raw greys; `globals.css` defines it, but
   every page shell still uses the old Tailwind literal instead of `bg-surface`. Affects
   `src/app/page.tsx:32`, `src/app/trips/page.tsx:56`, `src/app/trips/[id]/page.tsx:71`,
   `src/app/error.tsx:21`, `src/app/not-found.tsx:11`, `src/app/offline/page.tsx:16`,
   `src/app/settings/page.tsx:23`, `src/app/shared/[token]/page.tsx:49`,
   `src/app/shared/[token]/SharedTripView.tsx:50`, `src/app/trips/new/page.tsx:11`,
   `src/app/trips/[id]/edit/page.tsx:49`, `src/app/trips/[id]/loading.tsx:27`,
   `src/app/trips/[id]/places/loading.tsx:23`, `src/app/trips/[id]/places/page.tsx:289`,
   `src/app/trips/[id]/activities/[activityId]/edit/page.tsx:39` (15 of 16; only
   `print/page.tsx` is correctly pinned light per ADR).
   **Fix:** replace `bg-zinc-50 dark:bg-zinc-950` with `bg-surface` (or drop the class — `body`
   already sets `background: var(--background)`, which now equals `--surface`) on every page
   shell listed above.

2. **`text-black dark:text-zinc-50` hardcoded 85 times across 29 files instead of the
   `text-foreground`/`text-surface-fg` token.** e.g. `src/app/trips/TripForm.tsx:47`,
   `src/app/trips/[id]/ActivityForm.tsx:54`, `src/app/page.tsx:44,68`,
   `src/app/trips/page.tsx:65,111`, `src/app/trips/[id]/ItineraryDays.tsx:302,363,591`. The token
   exists and resolves to the exact same colours today, but a future palette tweak (the whole
   point of tokenizing) would silently miss all 85 sites. Recruiter-visible because it's the
   literal pattern ADR-0019 was written to eliminate, still dominant by volume.
   **Fix:** repo-wide `text-black dark:text-zinc-50` → `text-foreground`.

## Major

3. **The "one saturated colour" rule is broken by a second hardcoded blue.** ADR-0019 §2 declares
   `--accent` (#2563eb / #60a5fa dark) as the _only_ saturated colour in the itinerary besides
   now/next — but the voted-state pill in `src/app/trips/[id]/ItineraryDays.tsx:436-438` uses
   `border-blue-400 text-blue-600 dark:border-blue-500 dark:text-blue-400`, a different blue
   family not wired to the token. Reads as an accidental second accent, undermining the
   departure-board discipline of "exactly one saturated colour."
   **Fix:** swap to `border-accent text-accent dark:border-accent dark:text-accent` (or a
   `bg-accent/10` tint) so voted state reuses the single accent.

4. **Pin-colour swatch selection ring uses raw `border-black dark:border-white`**
   (`src/app/trips/[id]/ItineraryDays.tsx:475`) instead of `border-strong` or `border-accent`,
   the only two boundary tokens ADR-0019 defines. Inconsistent with every other selected-state
   border in the same file (`border-accent`, line 350-351).
   **Fix:** `border-strong dark:border-strong` (or `border-accent` to match the other
   selected-states in this component).

5. **Leftover starter-era button on the print export control.**
   `src/app/trips/[id]/print/ExportButton.tsx:11` — `bg-zinc-900 ... hover:bg-zinc-700
text-white` is exactly the pre-ADR `bg-foreground`/`hover:bg-[#383838]` idiom ADR-0019 opens by
   naming, just re-spelled in zinc literals rather than fixed. Every other primary button in the
   app (`TripForm.tsx:135`, `ActivityForm.tsx:165`, `trips/page.tsx:77`) already uses
   `bg-accent ... text-accent-fg hover:opacity-90`; this one file was missed.
   **Fix:** align to `bg-accent text-accent-fg hover:opacity-90`.

## Minor

6. **Skeleton/loading placeholders use raw `bg-zinc-200 dark:bg-zinc-800`** instead of a token
   (e.g. `--border` or a dedicated `--skeleton`), in `ItineraryDays.tsx:170`,
   `trips/[id]/loading.tsx:20`, `trips/[id]/places/loading.tsx:16`,
   `trips/[id]/places/page.tsx:195-197`. Low visual risk (skeletons are transient) but is the
   remaining un-migrated raw-grey category in the codebase.
   **Fix:** introduce `--color-skeleton` alongside the other tokens, or reuse `bg-border`.

7. **Hover states not tokenized:** `trips/page.tsx:104`'s row hover
   (`hover:bg-zinc-100 dark:hover:bg-zinc-800`) and `Attachments.tsx:111`'s file-input chip
   (`bg-zinc-100 ... dark:bg-zinc-800`) sit outside the semantic set even though `--surface-raised`
   and `--border` already cover cards/panels.
   **Fix:** `hover:bg-border/40` (or a new `--surface-hover` token) for consistency with the rest
   of the token rollout.

8. **Landing page (`src/app/page.tsx`) never picked up the departure-board register at all** — no
   tabular numerals, no rule-based section dividers, plain `<dl>` of two-column feature blurbs.
   Reasonable given ADR-0019's scope was itinerary/budget/print/share, but it's the first thing a
   recruiter sees and now visually disagrees with the rest of the app (compounds finding #1 — it's
   also still on raw zinc backgrounds).
   **Fix:** out of ADR-0019's scope as written; flag for a follow-up ADR/C-task rather than fixing
   here.

---

**3 critical · 3 major · 3 minor.** No Hallmark "AI template" structural fallthrough found —
`ItineraryDays.tsx`/`BudgetPanel.tsx` genuinely implement the rail/tabular-numeral treatment ADR-0019
specifies, and dark mode + focus rings + `color-scheme` are intact. The gap is consistency, not
direction: the token set in `globals.css` is well-designed but its adoption stopped at cards/borders
and skipped page backgrounds and body text colour, leaving the two most-visible surfaces (every
page's background, most labels' text colour) on pre-ADR literals.

## Fixes applied (class/style-level only, ADR-0019)

1. **Fixed.** `bg-zinc-50 dark:bg-zinc-950` → `bg-surface` across the 15 page shells listed.
2. **Fixed.** `text-black dark:text-zinc-50` → `text-foreground`, 85 occurrences across 29 files
   (mechanical sweep), plus 4 more variants the literal-substring count missed because other
   classes sat between `text-black` and `dark:text-zinc-50` (`Attachments.tsx:61`,
   `TransitLeg.tsx:65,73`, `ExtensionTokenPanel.tsx:60`, `SharingPanel.tsx:89` — the last two also
   dropped the now-redundant `dark:text-zinc-50` since `text-foreground` already carries a `.dark`
   value). `print/page.tsx`'s four `text-black` sites are unchanged — deliberately pinned light
   per ADR-0019, not a miss.
3. **Fixed.** `ItineraryDays.tsx:436` voted-pill blue → `border-accent text-accent dark:border-accent
dark:text-accent`.
4. **Fixed.** `ItineraryDays.tsx:475` pin-colour selection ring → `border-accent`, matching the
   selected-activity border at line 350 in the same file.
5. **Not applied — investigated and left as-is.** `ExportButton.tsx`'s hardcoded
   `bg-zinc-900 hover:bg-zinc-700 text-white` carries a comment explaining it was deliberately kept
   over `bg-accent text-accent-fg` in M10's own C2 token-rollout commit (b84599c), because a
   dark-theme viewer previously hit a near-black-on-near-black (~1.17:1) contrast failure on this
   button when it used token classes on this always-light print route. Reverting that fix to
   satisfy this finding would reintroduce a known, documented bug, so it was left hardcoded. Flagging
   for the owner rather than silently overriding a prior deliberate decision.
6. **Fixed.** Skeleton placeholders `bg-zinc-200 dark:bg-zinc-800` → `bg-border`, 6 occurrences
   across 4 files (`ItineraryDays.tsx:170`, `loading.tsx` ×2, `places/page.tsx` ×3).
7. **Fixed.** `trips/page.tsx:104` row hover → `hover:bg-border/40`. `Attachments.tsx:111` file-input
   chip background → `file:bg-border` (static chip, not a hover state, so no `/40`; dropped the
   redundant `dark:file:bg-zinc-800` since the token already carries a `.dark` value).
8. **Not applied** — out of ADR-0019's scope as the audit itself notes; left for a follow-up
   ADR/C-task.

Verification: `npx tsc --noEmit`, `npx eslint .`, and `npx prettier --check`/`--write` on every
touched file all pass clean. No logic changed — class/style edits only.
