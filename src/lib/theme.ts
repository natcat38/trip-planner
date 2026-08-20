/**
 * Pure theme-resolution helpers shared by the inline anti-flash script
 * (duplicated there as plain JS, since a `<script>` tag can't import a
 * module — see `src/app/layout.tsx`) and the `ThemeToggle` client component.
 * Kept dependency-free so it's testable without a DOM.
 * @packageDocumentation
 */

/** What the user has (or hasn't) chosen. Persisted verbatim to localStorage. */
export type ThemePreference = 'light' | 'dark' | 'system';

/** What actually gets applied to the page — "system" always resolves to one of these. */
export type AppliedTheme = 'light' | 'dark';

/** localStorage key the preference is stored under. */
export const THEME_STORAGE_KEY = 'theme';

const THEME_PREFERENCES: readonly ThemePreference[] = [
  'light',
  'dark',
  'system',
];

/** Narrows an arbitrary value (e.g. a raw localStorage read) to a ThemePreference. */
export function isThemePreference(value: unknown): value is ThemePreference {
  return (
    typeof value === 'string' && (THEME_PREFERENCES as string[]).includes(value)
  );
}

/**
 * Resolves a stored preference plus the OS-level preference into the theme
 * that should actually be applied. `stored` is untyped on purpose — it
 * usually comes straight from `localStorage.getItem`, which a browser
 * extension, a previous app version, or manual tampering can put anything
 * into. Anything that isn't a recognised preference (including null,
 * undefined, or a stray string) falls back to "system" rather than
 * throwing, since a display preference should never be able to crash the
 * page.
 */
export function resolveTheme(
  stored: unknown,
  systemPrefersDark: boolean,
): AppliedTheme {
  const preference: ThemePreference = isThemePreference(stored)
    ? stored
    : 'system';
  return preference === 'system'
    ? systemPrefersDark
      ? 'dark'
      : 'light'
    : preference;
}
