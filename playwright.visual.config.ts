import { defineConfig } from '@playwright/test'

// Visual-regression tier: diffs the new app against the original
// prototype running live (not a committed baseline PNG), per
// ctx/notes/260915-prototype-migration-phase3-tooling.md §3. Both dev
// servers run for the duration of this tier; the prototype is vendored
// under ctx/support/260915-prototype-source/ and pinned to a fixed port
// (it has no `server.port` of its own).
//
// Run with: pnpm e2e:visual
// Requires `npm install` inside ctx/support/260915-prototype-source/ once
// (its own node_modules, gitignored, kept separate from this repo's pnpm
// install — the prototype stays vendored/frozen, not restructured).
//
// KANVY_VISUAL_NEW_APP_PORT / KANVY_VISUAL_PROTOTYPE_PORT override the
// two ports (default 5173/5174) — useful when a sandboxed dev environment
// only forwards a specific port range to the browser driving these tests;
// never hardcode such an environment-specific port into this file.
const NEW_APP_PORT = process.env.KANVY_VISUAL_NEW_APP_PORT ?? '5173'
const PROTOTYPE_PORT = process.env.KANVY_VISUAL_PROTOTYPE_PORT ?? '5174'

export default defineConfig({
  testDir: './e2e/visual',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  use: {
    trace: 'on-first-retry',
  },
  webServer: [
    {
      // --host binds all interfaces, not just loopback — needed so a
      // remote/containerized browser can reach the dev server.
      command: `pnpm exec vite --host --port ${NEW_APP_PORT} --strictPort`,
      url: `http://localhost:${NEW_APP_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
    {
      command: `npm run dev -- --host --port ${PROTOTYPE_PORT} --strictPort`,
      cwd: './ctx/support/260915-prototype-source',
      url: `http://localhost:${PROTOTYPE_PORT}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
})
