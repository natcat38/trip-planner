import { describe, expect, it } from 'vitest';
import { requireEnv } from './env';

describe('requireEnv', () => {
  it('returns the value when set', () => {
    process.env.TEST_VAR = 'x';
    expect(requireEnv('TEST_VAR')).toBe('x');
  });
  it('throws with the var name when missing', () => {
    delete process.env.MISSING_VAR;
    expect(() => requireEnv('MISSING_VAR')).toThrow('MISSING_VAR');
  });
});
