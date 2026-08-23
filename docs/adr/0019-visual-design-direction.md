# ADR-0019: Visual design direction — "departure board"

**Status:** Accepted (2026-08-23)

Owner approved the full direction (§1–§4) on the existing `#2563eb` accent, choosing convergence
over alternative (b)'s teal/orange. Open question 3 (now/next highlighting) is therefore in scope
for this milestone. Open question 4 is settled below.

## Context
The frontend-design audit that opened Milestone 10 found that Trip Planner is still visually
the unmodified `create-next-app` starter. Milestone 9 (just merged into this branch) was a
compliance pass — accessibility, focus rings, contrast, labels, loading states, responsive layout
— and deliberately did not restyle anything, so the starter idioms are all still there:
`border-black/[.08]` (light) / `dark:border-white/25` for every card and input border,
`bg-foreground text-background` pills for primary buttons, and
`hover:bg-[#383838] dark:hover:bg-[#ccc]` for their hover state. A representative example, from
`src/app/trips/TripForm.tsx:135`:

```
className="mt-2 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background hover:bg-[#383838] disabled:opacity-50 dark:hover:bg-[#ccc]"
```

and every bordered input/card in `src/app/trips/[id]/ActivityForm.tsx`:

```
className="rounded border border-black/[.08] px-3 py-2 text-sm dark:border-white/25 dark:bg-transparent"
```

Grepping for this pattern set (`border-black/[.08]`, `bg-foreground text-background`,
`hover:bg-[#383838]`) across `src` currently returns **29 files**, not the 23 the audit counted —
the audit's number is stale or used a narrower pattern; the discipline point (one sweep, one
scoped token set) holds regardless of the exact count.

Milestone 10 is the design elevation this motivates. This ADR is C1 of that milestone and
proposes the direction; C2–C7 (token rollout, itinerary/budget componentry, print, the extension
popup, etc.) are gated on this being approved or redirected. Nothing here changes code — no files
outside `docs/adr/` are touched by this ADR.

### What exists today
`src/app/globals.css` after M9:

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
  color-scheme: light;
}

@theme inline {
  --color-background: var(--background);
  --color-foreground: var(--foreground);
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

.dark {
  --background: #0a0a0a;
  --foreground: #ededed;
  color-scheme: dark;
}
```

Two tokens, no semantic layer — every component reaches for `border-black/[.08]`,
`text-zinc-500`, `text-red-600`, etc. directly rather than through a named surface/border/status
scale. M9 added, and this ADR must not disturb:
- the global `:focus-visible` ring (`globals.css:37`, `outline: 2px solid #2563eb`)
- `color-scheme: light` / `color-scheme: dark` on `:root`/`.dark`
- AA-contrast colour substitutions made component-by-component (e.g. `text-zinc-600` over
  lighter greys)
- ≥24px hit targets on every interactive control
- the shared `SubmitButton` / `ConfirmSubmitButton` / `Select` primitives
  (`src/components/*.tsx`) that M9 introduced so pending/disabled/confirm states aren't
  reimplemented per form

None of the changes below touch the focus ring's colour or the `color-scheme` declarations, and
the new tokens are additive to — not a replacement for — the three shared primitives; the
primitives' behaviour (pending state, confirm dialog, select semantics) is unaffected, only the
classes they're passed change in C-tasks after this one.

### Where a departure-board treatment would actually land
`src/app/trips/[id]/ItineraryDays.tsx` renders each day as an `<h2>` + a `<ul>` of activity
`<li>` cards (`rounded-lg border p-4`), each showing title, category, a `·`-joined line of
time/place/cost, and per-activity vote/pin-colour/move/edit/delete controls. Times
(`activity.startTime–activity.endTime`) and costs (`formatMoney`) are inline in that joined
string today, in the body font, proportionally spaced — a `9:30` and a `14:05` don't align, and
neither do `¥1,200` and `¥12,000`.

`src/app/trips/[id]/BudgetPanel.tsx` is a single card: a status line (`budgetBannerText`, over/
under budget), a by-category breakdown list, an unconverted-items warning list, and an expense
list — every number rendered with `formatMoney` but, again, in body type with no numeric
alignment.

`src/app/trips/[id]/print/page.tsx` duplicates a light-only subset of both (`bg-white`,
`text-black`, no `dark:` variants at all — printed output must stay ink-legible regardless of the
viewer's OS theme) and is reached only through `requireTripAccess`.

## Decision
Adopt a **"departure board / rail timetable"** direction: dense, tabular, numerals that line up,
a hard rule between days, and exactly one saturated colour reserved for now/next/selected state —
everything else stays ink-on-paper.

### 1. Warm-neutral ink/paper palette, tokenized
Replace the two raw `--background`/`--foreground` tokens with a semantic set, defined in
`:root` and overridden on `.dark` (same mechanism M9's `color-scheme` values already use):

| Token | Role |
|---|---|
| `--surface` / `--surface-fg` | page background / default text |
| `--surface-raised` / `--surface-raised-fg` | cards, popovers (today's implicit `bg-background` cards) |
| `--border` | replaces every `border-black/[.08]` / `dark:border-white/25` pair |
| `--accent` / `--accent-fg` | the one saturated colour — see §2 |
| `--warning` / `--warning-fg` | replaces ad hoc `amber-700`/`amber-400` (unconverted-budget-item rows) |
| `--positive` / `--positive-fg` | under-budget, confirmed states |
| `--danger` / `--danger-fg` | replaces ad hoc `red-600`/`red-400` (over budget, delete actions, selected-pin outline) |

"Warm-neutral" means the paper/ink base moves off pure `#ffffff`/`#171717`/`#0a0a0a` toward a
slightly warm off-white and a warm near-black (final hex values are a C2 implementation detail,
not an ADR-level commitment) — the kind of shift that reads as "designed paper" rather than
"default browser". `@theme inline` continues to map these to Tailwind utilities exactly as it
maps `--background`/`--foreground` today, so call sites move from `border-black/[.08]` to
`border-[var(--border)]` (or a `border-border` utility) one file at a time in C2, not as an
atomic rename.

### 2. Accent = the existing `#2563eb` blue family — reconcile, don't invent
Grepping for `2563eb` across the repo today finds it hardcoded in:
- `src/app/globals.css:37` — the M9 focus-visible ring
- `src/app/manifest.ts:21` — PWA `theme_color`
- `src/components/Map.tsx:25` — the default map-pin colour
- `extension/popup.css:42` — the browser extension's primary button
- `src/app/trips/[id]/ItineraryDays.tsx:34,269` — the "blue" entry in the activity pin-colour
  palette, and the fallback pin colour when none is chosen

**Correction to the task brief:** the brief cites `src/app/layout.tsx:58` as a fifth site
declaring `#2563eb`. It does not — line 58 is a comment, and `layout.tsx`'s `themeColor` export
(line 66) tracks `#ffffff` (light) / `#0a0a0a` (dark) to match the page background, not the
accent. `#2563eb` does not appear anywhere in `layout.tsx`. The reconciliation argument doesn't
depend on that fifth site — five real occurrences across four files is enough to make the point —
but the ADR should cite what's actually there.

The proposal: declare `--accent: #2563eb` (light) once, in `globals.css`, and point all of the
above at it instead of their own literal. `manifest.ts` and `extension/popup.css` are static
assets outside the CSS cascade (a web manifest JSON value, a separate extension bundle) so they
can't literally `var()` off the app's token — but they should be updated to the same hex with a
comment pointing at the token as the source of truth, so a future accent change is a documented
four-place edit instead of a silent drift. `Map.tsx` and `ItineraryDays.tsx` can consume the CSS
variable directly. **Zero new colours are invented** — the entire accent story is "stop declaring
this five times, declare it once."

Dark mode gets its own `--accent` value on `.dark` (a lighter/desaturated blue for sufficient
contrast against a dark paper background — exact value is a C2 detail); this must still pass the
same contrast bar M9 already established for interactive elements.

### 3. Six-step type scale, tabular numerals for anything counted or dated
A fixed scale — 36 / 24 / 18 / 15 / 13 / 11 (px, or the `rem` equivalent) — replacing today's
undifferentiated mix of `text-sm`/`font-medium`/`text-2xl` used ad hoc per component. Geist Mono
(already loaded as `--font-geist-mono` / `--font-mono` in `globals.css` — no new font
dependency) plus `font-variant-numeric: tabular-nums` applies to every rendered money value
(`formatMoney` output), every time (`activity.startTime`–`endTime`), and every date
(`formatDay`, `formatDateRange`) — the departure-board register comes specifically from numerals
that line up in a column, which proportional Geist Sans does not give for free.

### 4. Departure-board treatment for itinerary and budget
Concretely, in `ItineraryDays.tsx`:
- Each day's `<h2>` becomes a heavier rule — full-width border-bottom, not just a text weight
  bump — so days read as timetable sections, not article headings.
- Each activity row moves start/end time into its own tabular-numeral column, left of the
  title/category text, instead of being folded into the `·`-joined description string it's part
  of today.
- Cost, if present, moves to a right-aligned tabular-numeral column instead of trailing in the
  same joined string.
- The selected-activity highlight (`border-red-400`/`dark:border-red-500`) becomes the accent
  colour, and is the only place a saturated colour appears in the list besides "now" (today's day
  section, if the trip is in progress — new: not present today) and "next" (the next unstarted
  activity — new: not present today).

In `BudgetPanel.tsx`:
- The category breakdown and expense lists (currently `flex justify-between` rows in body type)
  become two tabular-numeral columns — label left-aligned, amount right-aligned, monospaced —
  so a column of `¥1,200` / `¥12,000` / `¥340,000` actually lines up.
- The over/under-budget banner keeps its role (danger/positive semantic colour) but the amount
  itself renders in the same tabular-numeral treatment as every other money value, for
  consistency with the expense rows below it.

`src/app/trips/[id]/print/page.tsx` gets the same tabular/columnar treatment (it already
duplicates most of `BudgetPanel`'s and `ItineraryDays`' markup for a light-only, nav-free
render) but stays light-only by construction — `--surface`/`--surface-fg` resolve to their
light values there regardless of viewer theme, the same way `color-scheme` is pinned today via
`bg-white`/`text-black` literals. The public `/shared/[token]` view
(`src/app/shared/[token]/SharedTripView.tsx`) is in scope for the same treatment as the
authenticated itinerary/budget views — the departure-board direction is not something a visitor
loses by following a share link.

No icon library is introduced by any of this — any icon this direction needs is hand-drawn
inline SVG or copied inline, consistent with the existing plan for M10's remaining tasks.

## Alternatives considered

### (a) Keep the quiet greyscale, but tokenize it
Do §1 (the semantic token set) and §2 (accent reconciliation) exactly as proposed, but skip §3
and §4 — no type-scale change, no tabular numerals, no departure-board componentry. This is the
lower-risk, lower-reward option: it still fixes the real problems (scattered accent
declarations, ad hoc greys with no contrast discipline, borders duplicated across 29 files) and
is a much smaller diff to review, but it leaves the app looking like a tokenized version of the
starter rather than a designed product. It's the right call if the owner's priority for M10 is
"stop the drift" rather than "look intentional" — worth choosing deliberately rather than by
default, since it's a materially different and smaller scope than what C2–C7 as currently
numbered assume.

### (b) The ui-ux-pro-max skill's teal/orange travel palette
The `ui-ux-pro-max` skill ships a stock "travel" product palette (teal primary, orange accent)
as one of its pre-built options. It would give the app a distinct, immediately-recognizable
"travel app" identity — teal/orange reads as travel/hospitality the way it does for many
booking sites — and sidesteps the accent-reconciliation argument entirely by not reusing
`#2563eb` for anything. The cost: it invents two new colours the app has no existing footprint
for, none of the four hardcoded `#2563eb` sites get simplified (they'd all need to change to the
new palette instead of converging on what's already there), and it competes with rather than
reinforces the blue already baked into the PWA manifest's home-screen icon tinting and the
extension popup — a user who's already installed the PWA would see its `theme_color` and its
in-app accent diverge until manifest/extension assets are separately redone. It's a fair
direction if the owner wants a distinctive brand identity independent of what's already shipped;
it's the wrong one if the goal is convergence and low risk.

## Consequences

If approved, this direction determines the shape of C2–C7:
- **C2** (token rollout) is the highest-risk task in the set: every one of the 29 files carrying
  `border-black/[.08]` / `bg-foreground text-background` / `hover:bg-[#383838]` needs a pass,
  and a missed file reads as a visible inconsistency, not a build failure — nothing catches this
  automatically. It should be swept file-by-file with a visual check (not a single blind
  find-and-replace), and is easy to leave half-done if the milestone runs out of time partway
  through.
- **Print and the public share view must land in the same C-task as the authenticated views**,
  or the app ends up with three visual languages instead of one for a while — old, new, and
  print/shared-still-old.
- **Dark mode is a first-class target, not a follow-up**: every token in §1 needs a `.dark`
  value from the start, matching how `--background`/`--foreground` already work.
- The accent reconciliation (§2) is a net simplification independent of whether §3/§4 are
  approved — `manifest.ts`, `Map.tsx`, `extension/popup.css`, and `globals.css` currently have
  no shared source of truth for `#2563eb`, and a future rebrand today would require finding all
  five occurrences by hand.
- Choosing alternative (a) instead of the full direction changes what C3–C7 actually build —
  they'd become a tokenization pass rather than a componentry pass — so approval needs to name
  which option, not just approve "the ADR."

## Open questions for the owner
1. Full departure-board direction (§1–§4), or alternative (a) — tokenize now, componentry later?
2. Is teal/orange (alternative (b)) worth the divergence from the four existing `#2563eb` sites,
   or does convergence on the existing blue win?
3. Does "now"/"next" highlighting in the itinerary (new behaviour, not present today —
   §4) belong in this milestone, or is it scope creep to defer to a later one?
4. ~~Should `manifest.ts` and `extension/popup.css` be edited in the same C-task as `globals.css`?~~
   **Settled:** `manifest.ts` converges in C2 with the rest of the accent sites — it is one value
   and leaving it behind would mean the installed PWA's home-screen tint diverges from the app
   for the length of the milestone. `extension/popup.css` stays in C7, which already re-cuts that
   file wholesale; splitting its accent change out would mean touching it twice.
