import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/*.d.ts', 'src/**/generated/**'],
      // Floors of what's covered today, so a drop fails CI. Note these are
      // dragged down by app/**/actions.ts, which e2e covers and vitest doesn't
      // — raise them when you add unit tests, don't lower them to go green.
      thresholds: {
        statements: 80,
        branches: 64,
        functions: 76,
        lines: 80,
      },
    },
  },
});
