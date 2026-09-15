// Jotai wiring around the pure history reducer (./reducer.ts) for the
// Board itself, plus the autosave wiring the phase 5 plan's Stage 2
// assigns here: every board mutation goes through `updateBoardAtom`, which
// both records an undo step and (debounced) persists to localStorage —
// unless a corrupt-data recovery (spec §9/Q12) is still unacknowledged, in
// which case autosave stays suppressed so the original bad bytes are never
// clobbered before the user has had a chance to see what happened. A later
// UI stage surfaces `boardLoadResultAtom` and calls `acknowledgeRecoveryAtom`
// once the user has seen that notification.

import { atom } from 'jotai'
import type { Board } from '../../schema/board'
import { selectionAtom } from '../atoms/selection'
import {
  createDebouncedSaver,
  type LoadResult,
  loadBoard,
} from '../persistence/storage'
import {
  createHistoryState,
  type HistoryState,
  pushUpdate,
  redo as redoReducer,
  undo as undoReducer,
} from './reducer'

const initialLoad: LoadResult = loadBoard()
const saver = createDebouncedSaver()

/** The result of the initial localStorage load — `ok: false` means a corrupt-data recovery happened. */
export const boardLoadResultAtom = atom<LoadResult>(initialLoad)

/** Gates autosave (spec §9/Q12) — starts true unless the initial load was a recovery. */
export const recoveryAcknowledgedAtom = atom(initialLoad.ok)

export const boardHistoryAtom = atom<HistoryState<Board>>(
  createHistoryState(initialLoad.board),
)

export const boardAtom = atom((get) => get(boardHistoryAtom).present.state)

function autosaveIfAcknowledged(
  get: (a: typeof recoveryAcknowledgedAtom) => boolean,
  board: Board,
): void {
  if (get(recoveryAcknowledgedAtom)) saver.save(board)
}

/**
 * Applies `updater` as the next undo step. `restoreSelection` (spec
 * §8/Q11) is only meaningful for actions like delete, where undoing should
 * re-select what was restored.
 */
export const updateBoardAtom = atom(
  null,
  (
    get,
    set,
    updater: (board: Board) => Board,
    restoreSelection?: readonly string[],
  ) => {
    const history = get(boardHistoryAtom)
    const nextBoard = updater(history.present.state)
    const nextHistory = pushUpdate(
      history,
      nextBoard,
      Date.now(),
      restoreSelection,
    )
    set(boardHistoryAtom, nextHistory)
    autosaveIfAcknowledged(get, nextBoard)
  },
)

/** Acknowledges a corrupt-data recovery notification and resumes autosave. */
export const acknowledgeRecoveryAtom = atom(null, (get, set) => {
  set(recoveryAcknowledgedAtom, true)
  saver.save(get(boardAtom))
})

export const undoBoardAtom = atom(null, (get, set) => {
  const result = undoReducer(get(boardHistoryAtom))
  set(boardHistoryAtom, result.history)
  if (result.restoreSelection) {
    set(selectionAtom, new Set(result.restoreSelection))
  }
  autosaveIfAcknowledged(get, result.history.present.state)
})

export const redoBoardAtom = atom(null, (get, set) => {
  const nextHistory = redoReducer(get(boardHistoryAtom))
  set(boardHistoryAtom, nextHistory)
  autosaveIfAcknowledged(get, nextHistory.present.state)
})
