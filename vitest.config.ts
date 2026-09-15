import { defineConfig } from 'vitest/config'

// Unit tests target pure functions only (spec §13) — no DOM environment
// needed. Phase 6 built the suite against type-only stub modules (every
// function throws 'not implemented'), so coverage is expected to be ~0%
// right now — not a regression. No `coverage.thresholds` block yet:
// enable the 80% line-coverage gate from
// ctx/notes/260915-prototype-migration-phase3-tooling.md §3 once phase 7
// fills in real implementations.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.tsx', 'src/**/*.tsx'],
    },
  },
})
