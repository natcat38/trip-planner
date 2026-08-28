import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/generated/**'],
      // Floors of what's covered today, so a drop fails CI. Note these are
      // dragged down by app/**/actions.ts, which e2e covers and vitest doesn't
      // — raise them when you add unit tests, don't lower them to go green.
      //
      // Keyed by glob so widening `include` to .tsx doesn't drag the .ts floor
      // down with it: the .tsx files are Playwright-covered, not vitest-covered,
      // so they'd read ~0% here and force a 20-point cut to the numbers that
      // actually gate the server code. Files matching a glob threshold are
      // excluded from the global ones, so .tsx is reported but ungated until
      // it has unit tests — add a 'src/**/*.tsx' block then.
      thresholds: {
        'src/**/*.ts': {
          statements: 80,
          branches: 64,
          functions: 76,
          lines: 80,
        },
      },
    },
  },
});
