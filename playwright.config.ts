import { defineConfig } from '@playwright/test'

// Interaction-behavior e2e suite.
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

// KANVY_E2E_HOST overrides the hostname the *browser* uses to reach the dev
// server (default localhost) — needed when the browser itself is remote
// (e.g. a Playwright server on the macOS host connected to from a
// container via PW_TEST_CONNECT_WS_ENDPOINT, per the
// playwright-remote-browser skill): "localhost" from that browser's
// perspective is the host machine, not this container, so the browser must
// instead target this container's own address. The webServer command below
// always binds to all interfaces regardless of this value.
const HOST = process.env.KANVY_E2E_HOST ?? 'localhost'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://${HOST}:${PORT}`,
    trace: 'on-first-retry',
    // Needed for e2e/errorHandlingA11yTouch.spec.ts's touch-drag spec,
    // which uses page.touchscreen — Playwright refuses touchscreen calls
    // on a context that wasn't created with this.
    hasTouch: true,
  },
  webServer: {
    // --host binds all interfaces, not just loopback — needed so a
    // remote/containerized browser can reach the dev server.
    command: `pnpm exec vite --host --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
  },
})
