import { defineConfig } from '@playwright/test'

// Config only — the e2e suite (interaction behavior) and the separate
// visual-regression tier (diffing against the live original prototype,
// per ctx/notes/260915-prototype-migration-phase3-tooling.md §3) are both
// built in prototype-migration phase 6.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
