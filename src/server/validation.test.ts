import { describe, expect, it } from 'vitest';
import { ValidationError } from './errors';
import { requireOptionalText, requireText } from './validation';

describe('requireText', () => {
  it('trims surrounding whitespace and returns the trimmed value', () => {
    expect(requireText('  Tokyo  ', 'title', 10)).toBe('Tokyo');
  });

  it('rejects an empty string', () => {
    expect(() => requireText('', 'title', 10)).toThrow(ValidationError);
    expect(() => requireText('', 'title', 10)).toThrow('Enter a title.');
  });

  it('rejects a whitespace-only string as empty', () => {
    expect(() => requireText('   ', 'title', 10)).toThrow(ValidationError);
  });

  it('uses the custom emptyMessage when provided', () => {
    expect(() =>
      requireText('', 'title', 10, 'Enter a title for this activity.'),
    ).toThrow('Enter a title for this activity.');
  });

  it('accepts a value exactly at maxLength', () => {
    const value = 'a'.repeat(10);
    expect(requireText(value, 'title', 10)).toBe(value);
  });

  it('rejects a value one character over maxLength', () => {
    const value = 'a'.repeat(11);
    expect(() => requireText(value, 'title', 10)).toThrow(ValidationError);
    expect(() => requireText(value, 'title', 10)).toThrow(
      'That title is too long.',
    );
  });

  it('measures length after trimming, not before', () => {
    const value = `  ${'a'.repeat(10)}  `;
    expect(requireText(value, 'title', 10)).toBe('a'.repeat(10));
  });
});

describe('requireOptionalText', () => {
  it('returns undefined for undefined input', () => {
    expect(requireOptionalText(undefined, 'notes', 10)).toBeUndefined();
  });

  it('returns undefined for an empty string', () => {
    expect(requireOptionalText('', 'notes', 10)).toBeUndefined();
  });

  it('returns undefined for a whitespace-only string', () => {
    expect(requireOptionalText('   ', 'notes', 10)).toBeUndefined();
  });

  it('trims and returns a valid value', () => {
    expect(requireOptionalText('  hi  ', 'notes', 10)).toBe('hi');
  });

  it('accepts a value exactly at maxLength', () => {
    const value = 'a'.repeat(10);
    expect(requireOptionalText(value, 'notes', 10)).toBe(value);
  });

  it('rejects a value one character over maxLength', () => {
    const value = 'a'.repeat(11);
    expect(() => requireOptionalText(value, 'notes', 10)).toThrow(
      ValidationError,
    );
    expect(() => requireOptionalText(value, 'notes', 10)).toThrow(
      'That notes is too long.',
    );
  });
});
