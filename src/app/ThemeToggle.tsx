'use client';

/**
 * Light/dark/system theme toggle. Rendered inline by every top-level page
 * chrome — `AppHeader` for authed routes, and a small header bar on the
 * public `/` and `/shared/[token]` pages that don't get an `AppHeader` — so
 * it's present on every route including those two unauthenticated ones.
 * This is a display preference, not account data, so it lives in
 * localStorage rather than Postgres (see `src/lib/theme.ts`).
 *
 * This component only needs to (a) reflect the current preference and (b)
 * write a new one on change. The actual page repaint on first load is
 * handled by the inline script in `src/app/layout.tsx`, not here — by the
 * time this client component mounts and hydrates, the correct theme is
 * already applied, so there's nothing to "flash".
 * @packageDocumentation
 */
import { useSyncExternalStore } from 'react';
import { Select } from '@/components/Select';
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

// localStorage is the external store `useSyncExternalStore` exists for —
// same pattern as `useIsOffline` (src/lib/useIsOffline.ts) reading
// `navigator.onLine`. This is also what actually fixes the bug this
// component used to have: its `<select>` kept showing "System theme" after
// a reload even though the right theme was applied and the preference was
// persisted correctly. The old code read localStorage in a `useState` lazy
// initializer, so the client's first render already computed the true
// preference (e.g. "dark") — but a native <select>'s displayed value is
// only synced to a new `value` prop on a genuine React commit, and the
// commit that hydrates server-rendered markup isn't one (the DOM node
// already exists, so React never re-runs the mount-time value sync for it).
// The dropdown was stuck showing whatever the *server* rendered ("system",
// since there's no localStorage during SSR) until something else happened
// to touch it. `useSyncExternalStore` is built to solve exactly this: it
// takes a separate `getServerSnapshot` for the SSR/hydration pass and
// forces a real post-hydration re-render if the client snapshot differs,
// which — unlike a plain lazy `useState` — does sync the select's value.
//
// `listeners` covers this component's own writes (handleChange below),
// which don't fire the browser's `storage` event — that only fires in
// *other* tabs/documents. The `storage` listener covers those other tabs.
const listeners = new Set<() => void>();

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('storage', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('storage', onChange);
  };
}

function notify(): void {
  for (const listener of listeners) listener();
}

const getServerSnapshot = (): ThemePreference => 'system';

export function ThemeToggle() {
  const preference = useSyncExternalStore(
    subscribe,
    readStoredPreference,
    getServerSnapshot,
  );

  function handleChange(event: React.ChangeEvent<HTMLSelectElement>): void {
    const next = event.target.value;
    if (!isThemePreference(next)) return;
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
    notify();
  }

  return (
    // No positioning here on purpose — every call site renders this inline
    // in its own header row now (AppHeader for authed routes, a small
    // print:hidden bar on the public/shared pages that have no AppHeader),
    // rather than the fixed-position corner overlay this used to be.
    <>
      <label htmlFor="theme-preference" className="sr-only">
        Theme
      </label>
      <Select
        id="theme-preference"
        value={preference}
        onChange={handleChange}
        className="px-2 py-1 text-sm text-zinc-600 shadow-sm dark:text-zinc-400"
        options={[
          { value: 'system', label: 'System theme' },
          { value: 'light', label: 'Light' },
          { value: 'dark', label: 'Dark' },
        ]}
      />
    </>
  );
}
