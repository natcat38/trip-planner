import { describe, expect, it } from 'vitest';
import { minorUnitExponent, toMinorUnits } from './money';

describe('minorUnitExponent', () => {
  it('returns 0 for JPY (no minor unit)', () => {
    expect(minorUnitExponent('JPY')).toBe(0);
  });

  it('returns 2 for EUR', () => {
    expect(minorUnitExponent('EUR')).toBe(2);
  });

  it('throws for a malformed currency code', () => {
    expect(() => minorUnitExponent('JP')).toThrow();
  });
});

describe('toMinorUnits', () => {
  it('converts a whole-yen amount with no decimals', () => {
    expect(toMinorUnits(350000, 'JPY')).toBe(350000);
  });

  it('converts a euro amount with cents', () => {
    expect(toMinorUnits(3500.5, 'EUR')).toBe(350050);
  });

  it('rounds to the nearest minor unit to avoid float drift', () => {
    expect(toMinorUnits(19.999, 'EUR')).toBe(2000);
  });
});
