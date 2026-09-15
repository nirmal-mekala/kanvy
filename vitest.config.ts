import { defineConfig } from 'vitest/config'

// Unit tests target pure functions only (spec §13) — no DOM environment
// needed. Config only; the actual suite is built in prototype-migration
// phase 6.
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
