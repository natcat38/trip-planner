import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3000' },
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
