import { defineConfig } from '@playwright/test';

// PLAYWRIGHT_BASE_URL lets the ux-smoke suite run against an arbitrary
// deployment (see "test:e2e:prod" in package.json) instead of the local
// build this config otherwise boots via webServer. Unset, behavior is
// unchanged: localhost baseURL, webServer boots `next build && next start`.
const remoteBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: remoteBaseURL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  // Most assertions here wait on a real server-action round-trip — a DB
  // write, a revalidate and a re-render — not on client state. That
  // overruns Playwright's 5s default on CI's two-core runner under parallel
  // load while passing locally, so the timeouts are raised suite-wide
  // rather than patched per test as each one surfaces. Waiting for the
  // round-trip is what these assertions are for.
  expect: { timeout: 20_000 },
  timeout: 90_000,
  // CI-only. History: until 2026-11-16 CI failed a DIFFERENT post-mutation
  // assertion each run, which was read as a slow runner. It was a real bug
  // in Next 16.2's client: after a Server Action that revalidates, the page
  // sometimes did not re-render until something else triggered a render
  // (here, the 60s clock in DayTiming.tsx), so the form sat on "Saving…".
  // Fixed by Next 16.4.6 (60/60 passes on the test that failed 42/60 before).
  // Retries stay as a guard for the two-core runner. Playwright reports a
  // retried test as flaky: treat a recurring flaky test as a bug to
  // diagnose, not as noise.
  retries: process.env.CI ? 2 : 0,
  // Only boot a local server when no remote target was given — against a
  // real deployment there's nothing local to build/start.
  ...(remoteBaseURL
    ? {}
    : {
        webServer: {
          // Production build, not `next dev`: CI has no other `next build` step, so a
          // build-breaking commit would otherwise only surface on Vercel — after
          // ADR-0002 has already migrated Neon.
          command: 'npm run build && npm run start',
          url: 'http://localhost:3000',
          timeout: 180_000,
          reuseExistingServer: !process.env.CI,
        },
      }),
});
