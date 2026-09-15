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
      command: 'pnpm exec vite --host',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command: 'npm run dev -- --host --port 5174 --strictPort',
      cwd: './ctx/support/260915-prototype-source',
      url: 'http://localhost:5174',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
