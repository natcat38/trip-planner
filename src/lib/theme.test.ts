import { describe, expect, it } from 'vitest';
import { isThemePreference, resolveTheme } from './theme';

describe('resolveTheme', () => {
  it('applies an explicit light preference regardless of OS setting', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('applies an explicit dark preference regardless of OS setting', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('follows the OS preference when set to "system" and the OS is dark', () => {
    expect(resolveTheme('system', true)).toBe('dark');
  });

  it('follows the OS preference when set to "system" and the OS is light', () => {
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('falls back to system (not a throw) for a corrupt or unknown stored value', () => {
    expect(resolveTheme('sepia', true)).toBe('dark');
    expect(resolveTheme('sepia', false)).toBe('light');
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(undefined, false)).toBe('light');
    expect(resolveTheme(42, true)).toBe('dark');
  });
});

describe('isThemePreference', () => {
  it('accepts the three valid preferences', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isThemePreference('sepia')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
    expect(isThemePreference(1)).toBe(false);
  });
});
