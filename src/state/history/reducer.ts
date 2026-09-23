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
 * coalescing window is deterministically testable. `forceNewEntry` lets a
 * caller override coalescing even within the window, when its own domain
 * logic says these two updates shouldn't merge regardless of timing — e.g.
 * multiboard support's per-board attribution (state/history/
 * boardHistoryAtom.ts): two rapid edits to *different* boards must never
 * coalesce into one entry, since that entry's single attribution couldn't
 * represent both.
 *
 * `merge`, when given, is used instead of a bare wholesale replace when an
 * update coalesces into the current entry — schema v4's ops-based history
 * (state/ops.ts's `mergeOpLists`) needs this to *combine* the current
 * entry's ops with the new ones rather than discarding the former, since
 * an ops entry (unlike the old whole-`Board` snapshot) doesn't already
 * contain everything a later increment in the same gesture touched.
 * Omitted, this defaults to "the new value wins," i.e. today's behavior.
 */
export function pushUpdate<T>(
  history: HistoryState<T>,
  next: T,
  now: number,
  restoreSelection?: readonly string[],
  forceNewEntry = false,
  merge?: (prev: T, next: T) => T,
): HistoryState<T> {
  if (next === history.present.state) return history
  const coalesce = !forceNewEntry && now - history.lastActionAt < COALESCE_MS
  const past = coalesce
    ? history.past
    : [...history.past, history.present].slice(-MAX_HISTORY)
  const state = coalesce && merge ? merge(history.present.state, next) : next
  return {
    past,
    present: restoreSelection ? { state, restoreSelection } : { state },
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
