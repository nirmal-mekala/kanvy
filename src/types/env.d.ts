// Dev-only env vars for the TanStack Query mutation layer's simulated
// network (ctx/notes/260921-action-based-undo-and-tombstoning.md §3) —
// exercises loading/error states against a flaky/slow backend before a
// real one exists. Read (and only honored in dev builds) by
// src/api/boardApi.ts.
/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Simulated network latency in ms, applied to every query and mutation. */
  readonly VITE_MOCK_LATENCY_MS?: string
  /** Simulated error rate, 0–1, applied to every query and mutation. */
  readonly VITE_MOCK_ERROR_RATE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
