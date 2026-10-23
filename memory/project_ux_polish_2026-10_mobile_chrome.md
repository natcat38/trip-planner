---
name: project-ux-polish-2026-10-mobile-chrome
description: 2026-10-23 UX polish batch 1 (TRIP-UX-4/8/9/12/16) - sticky authed header with offline-banner offset, 16px fields on phones, 44px touch targets, wrapped activity titles; what it changed and what it deliberately left alone.
metadata:
  node_type: memory
  type: project
---

Branch `fix/ux-mobile-chrome`, from the 2026-10-23 UX audit. Five findings, one PR.

- **TRIP-UX-4:** `AppHeader` is `sticky top-[var(--offline-banner-h,0px)] z-40 bg-surface`.
  `OfflineReady` publishes its own height as `--offline-banner-h` on `<html>` (ResizeObserver)
  only while the offline banner shows, so the two sticky bars stack instead of overlapping.
  `html { scroll-padding-top }` in `globals.css` keeps the skip link's `#main` jump and focus
  scrolling out from under the bar.
- **TRIP-UX-8:** one unlayered rule in `globals.css` sets inputs, selects and textareas to 16px
  under `(pointer: coarse), (width < 40rem)`. Unlayered CSS beats Tailwind's utilities layer, so
  `text-sm` still applies on desktop and no call site changed. New form fields get this for free.
- **TRIP-UX-9:** `@utility touch-target` (globals.css) makes a control 44x44 below `sm` and leaves
  it alone above. Applied to the header links, trip nav links, vote, pin summary, move arrows, Edit
  and Delete. Cost: the trip page grew from 13.5 to 15.4 phone screens, because each row's two
  action lines are now 44px tall; TRIP-UX-10 (row menu) is the fix for that length.
- **TRIP-UX-16:** below `sm` the header drops the email and the theme select; Settings has an
  "Account" card (`sm:hidden`) with both. `ThemeToggle` takes an `id` so two copies can coexist.
- **TRIP-UX-12:** titles use `line-clamp-2 break-words` plus a `title` attribute; the cost moves
  under the time below `sm`.

**Not done:** the pin-colour palette swatches stay 24px (meets WCAG 2.5.8 AA, inside a popover);
Settings is still not linked from the header (only from the trips list).
