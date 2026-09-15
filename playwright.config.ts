import { defineConfig } from '@playwright/test'

// Interaction-behavior e2e suite. The visual-regression tier (diffing
// against the live original prototype, per
// ctx/notes/260915-prototype-migration-phase3-tooling.md §3) lives in
// playwright.visual.config.ts instead — it needs a second dev server
// (the vendored prototype) and isn't run by this config.
//
// Phase 6 built the harness (e2e/fixtures/, smoke tests) and a scenario
// checklist (ctx/notes/260915-phase6-e2e-test-scenario-checklist.md);
// phase 7 fills in the real interaction specs stage-by-stage.
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['visual/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: {
    // --host binds all interfaces, not just loopback — needed so a
    // remote/containerized browser can reach the dev server.
    command: 'pnpm exec vite --host',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
})
