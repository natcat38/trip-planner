import { describe, expect, it } from 'vitest';
import { safeCallback } from './safeCallback';

describe('safeCallback', () => {
  it('keeps a same-site path with its query', () => {
    expect(safeCallback('/trips/abc?day=2')).toBe('/trips/abc?day=2');
  });

  it('takes the first value when the param repeats', () => {
    expect(safeCallback(['/settings', '/trips'])).toBe('/settings');
  });

  it.each([
    undefined,
    '',
    'https://evil.example/',
    '//evil.example/',
    '/\\evil.example/',
    'javascript:alert(1)',
    'trips',
  ])('falls back to /trips for %s', (raw) => {
    expect(safeCallback(raw)).toBe('/trips');
  });
});
