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
//
// KANVY_E2E_PORT overrides the port (default 5173) — useful when a
// sandboxed dev environment only forwards a specific port range to the
// browser driving these tests; never hardcode such an environment-specific
// port into this file.
const PORT = process.env.KANVY_E2E_PORT ?? '5173'

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['visual/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'on-first-retry',
  },
  webServer: {
    // --host binds all interfaces, not just loopback — needed so a
    // remote/containerized browser can reach the dev server.
    command: `pnpm exec vite --host --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
