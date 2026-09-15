// Pure undo/redo history reducer — same shared-stack shape as the
// prototype's `historyReducer` (ctx/support/260915-prototype-source/src/
// state/useBoard.js), generalized over `T` so it isn't Board-specific, plus
// the spec §8/Q11 selection-restore-on-undo fix: an update may attach the
// ids that should be re-selected if it's later undone (used by node/edge
// deletion — see src/state/atoms/nodes.ts).
//
// Kept pure/framework-free per AGENTS.md's testable-module preference —
// src/state/history/boardHistoryAtom.ts is the thin Jotai wrapper around
// this.

/** Rapid-fire updates within this window coalesce into one undo step (spec §8/Q10). */
export const COALESCE_MS = 400

/** History depth (spec §8/Q10). */
export const MAX_HISTORY = 100

export interface HistoryEntry<T> {
  state: T
  /** Ids to re-select if this entry's update is later undone (spec §8/Q11). */
  restoreSelection?: readonly string[]
}

export interface HistoryState<T> {
  past: HistoryEntry<T>[]
  present: HistoryEntry<T>
  future: HistoryEntry<T>[]
  lastActionAt: number
}

export function createHistoryState<T>(initial: T): HistoryState<T> {
  return { past: [], present: { state: initial }, future: [], lastActionAt: 0 }
}

/**
 * Applies a new state value as the next history step. A no-op (same
 * reference as the current present) is dropped rather than recorded, same
 * as the prototype. `now` is injected (rather than read internally) so the
 * coalescing window is deterministically testable.
 */
export function pushUpdate<T>(
  history: HistoryState<T>,
  next: T,
  now: number,
  restoreSelection?: readonly string[],
): HistoryState<T> {
  if (next === history.present.state) return history
  const coalesce = now - history.lastActionAt < COALESCE_MS
  const past = coalesce
    ? history.past
    : [...history.past, history.present].slice(-MAX_HISTORY)
  return {
    past,
    present: restoreSelection
      ? { state: next, restoreSelection }
      : { state: next },
    future: [],
    lastActionAt: now,
  }
}

export interface UndoResult<T> {
  history: HistoryState<T>
  /** Set only when the undone entry requested a selection restore. */
  restoreSelection?: readonly string[]
}

export function undo<T>(history: HistoryState<T>): UndoResult<T> {
  const previous = history.past.at(-1)
  if (!previous) return { history }
  const nextHistory: HistoryState<T> = {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
    lastActionAt: 0,
  }
  return history.present.restoreSelection
    ? {
        history: nextHistory,
        restoreSelection: history.present.restoreSelection,
      }
    : { history: nextHistory }
}

export function redo<T>(history: HistoryState<T>): HistoryState<T> {
  const next = history.future[0]
  if (!next) return history
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
    lastActionAt: 0,
  }
}
