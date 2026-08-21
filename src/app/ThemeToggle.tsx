'use client';

/**
 * Light/dark/system theme toggle. Rendered once in the root layout so it's
 * present on every route, including the unauthenticated `/shared/[token]`
 * page — this is a display preference, not account data, so it lives in
 * localStorage rather than Postgres (see `src/lib/theme.ts`).
 *
 * This component only needs to (a) reflect the current preference and (b)
 * write a new one on change. The actual page repaint on first load is
 * handled by the inline script in `src/app/layout.tsx`, not here — by the
 * time this client component mounts and hydrates, the correct theme is
 * already applied, so there's nothing to "flash".
 * @packageDocumentation
 */
import { useState } from 'react';
import {
  isThemePreference,
  resolveTheme,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '@/lib/theme';

function readStoredPreference(): ThemePreference {
  // Guards SSR (no `window`/`localStorage` there) and a disabled/unavailable
  // store on the client — both fall back to "system".
  if (typeof window === 'undefined') return 'system';
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    return isThemePreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function applyTheme(preference: ThemePreference): void {
  const systemPrefersDark = window.matchMedia(
    '(prefers-color-scheme: dark)',
  ).matches;
  const applied = resolveTheme(preference, systemPrefersDark);
  document.documentElement.classList.toggle('dark', applied === 'dark');
}

export function ThemeToggle() {
  // Lazy-initialized so the real stored preference is read on the client's
  // very first render (no effect + extra render needed to catch up). This
  // can legitimately differ from the server-rendered "system" default —
  // same story as the page's own theme class, which the inline script in
  // layout.tsx already sets ahead of hydration — hence suppressHydrationWarning
  // below on the one attribute (the select's value) that depends on it.
  const [preference, setPreference] =
    useState<ThemePreference>(readStoredPreference);

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    const next = event.target.value;
    if (!isThemePreference(next)) return;
    setPreference(next);
    try {
      if (next === 'system') {
        localStorage.removeItem(THEME_STORAGE_KEY);
      } else {
        localStorage.setItem(THEME_STORAGE_KEY, next);
      }
    } catch {
      // Storage can be unavailable (private browsing, quota) — the toggle
      // still applies for this page view, it just won't persist.
    }
    applyTheme(next);
  }

  return (
    // print:hidden because this renders from the root layout on EVERY route,
    // including /trips/[id]/print — the page whose only purpose is to be
    // exported as a PDF (ADR-0007). Without it the finished PDF carries a
    // floating theme dropdown stamped over the corner of the itinerary.
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      <label htmlFor="theme-preference" className="sr-only">
        Theme
      </label>
      {/* The explicit background on the select (and its options) is required,
          not cosmetic: a transparent select inherits the page's dark backdrop
          for its native option list but keeps default dark text, leaving the
          choices unreadable — see AiKeyPanel's model picker for the same fix. */}
      <select
        id="theme-preference"
        value={preference}
        onChange={handleChange}
        suppressHydrationWarning
        className="rounded border border-black/[.08] bg-white px-2 py-1 text-sm text-zinc-600 shadow-sm dark:border-white/25 dark:bg-zinc-900 dark:text-zinc-400"
      >
        <option value="system" className="bg-white dark:bg-zinc-900">
          System theme
        </option>
        <option value="light" className="bg-white dark:bg-zinc-900">
          Light
        </option>
        <option value="dark" className="bg-white dark:bg-zinc-900">
          Dark
        </option>
      </select>
    </div>
  );
}
