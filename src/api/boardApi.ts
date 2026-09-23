// The (for-now-local) network boundary TanStack Query sits on top of
// (ctx/notes/260921-action-based-undo-and-tombstoning.md §3) — first
// `src/api/` file in this repo. No real backend exists yet: `fetchBoard`/
// `saveBoard` wrap state/persistence/storage.ts's synchronous
// localStorage load/write in the async contract a query/mutation needs,
// so this layer's *internals* are the only thing that change once a real
// per-entity backend eventually lands (see the design doc's step 6).
//
// Dev-only simulated network (delay + error rate), applied uniformly to
// every query *and* mutation here — not mutations only — so read-path
// loading/error states are exercisable ahead of a real backend existing
// to be slow or flaky against. Env-gated (`import.meta.env.DEV`) and off
// by default even in dev (both vars default to 0) — set
// `VITE_MOCK_LATENCY_MS`/`VITE_MOCK_ERROR_RATE` in a local `.env` to
// exercise it.

import type { Board } from '../schema/board'
import {
  type LoadResult,
  loadBoard,
  writeBoard,
} from '../state/persistence/storage'

function envNumber(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

const LATENCY_MS = import.meta.env.DEV
  ? envNumber(import.meta.env.VITE_MOCK_LATENCY_MS, 0)
  : 0
const ERROR_RATE = import.meta.env.DEV
  ? envNumber(import.meta.env.VITE_MOCK_ERROR_RATE, 0)
  : 0

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * The delay/error-injection logic itself, as a pure function of explicit
 * params rather than the env-var constants directly — keeps it unit-
 * testable without fighting Vite's build-time `import.meta.env`
 * replacement. `withSimulatedNetwork` below is the thin env-driven
 * wrapper `fetchBoard`/`saveBoard` actually use.
 */
export async function simulateNetwork<T>(
  latencyMs: number,
  errorRate: number,
  run: () => T,
  random: () => number = Math.random,
): Promise<T> {
  if (latencyMs > 0) await sleep(latencyMs)
  if (errorRate > 0 && random() < errorRate) {
    throw new Error(
      'Simulated network error (VITE_MOCK_ERROR_RATE) — src/api/boardApi.ts',
    )
  }
  return run()
}

/** Dev-only latency + error-rate injection — a no-op in production builds or when both env vars are unset. */
function withSimulatedNetwork<T>(run: () => T): Promise<T> {
  return simulateNetwork(LATENCY_MS, ERROR_RATE, run)
}

/** The read side — wraps storage.ts's synchronous `loadBoard`. Not wired into the app's (still-synchronous, unchanged) initial board load; exists as this layer's read counterpart to `saveBoard`, ready for a real backend to eventually replace. */
export function fetchBoard(): Promise<LoadResult> {
  return withSimulatedNetwork(() => loadBoard())
}

/**
 * The write side — wraps storage.ts's synchronous `writeBoard`. Batched at
 * the history-entry (gesture) granularity by its one caller
 * (state/history/boardHistoryAtom.ts's debounced saver), not per-op, per
 * the design doc's explicit recommendation.
 */
export function saveBoard(board: Board): Promise<void> {
  return withSimulatedNetwork(() => writeBoard(board))
}
