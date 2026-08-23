import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
  // Most assertions here wait on a real server-action round-trip — a DB
  // write, a revalidate and a re-render — not on client state. That
  // overruns Playwright's 5s default on CI's two-core runner under parallel
  // load while passing locally, so the timeouts are raised suite-wide
  // rather than patched per test as each one surfaces. Waiting for the
  // round-trip is what these assertions are for.
  expect: { timeout: 20_000 },
  timeout: 90_000,
  webServer: {
    // Production build, not `next dev`: CI has no other `next build` step, so a
    // build-breaking commit would otherwise only surface on Vercel — after
    // ADR-0002 has already migrated Neon.
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    timeout: 180_000,
    reuseExistingServer: !process.env.CI,
  },
});
