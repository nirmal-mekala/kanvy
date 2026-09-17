// Jotai wiring around the pure history reducer (./reducer.ts) for the
// Board itself, plus the autosave wiring the phase 5 plan's Stage 2
// assigns here: every board mutation goes through `updateBoardAtom`, which
// both records an undo step and (debounced) persists to localStorage —
// unless a corrupt-data recovery (spec §9/Q12) is still unacknowledged, in
// which case autosave stays suppressed so the original bad bytes are never
// clobbered before the user has had a chance to see what happened. A later
// UI stage surfaces `boardLoadResultAtom` and calls `acknowledgeRecoveryAtom`
// once the user has seen that notification.
//
// Multiboard support (ctx/notes/260917-multiboard-support-design.md §5):
// since `nodes`/`edges` are shared flat arrays across all boards, each
// history entry is necessarily a whole-Board snapshot, not a per-board
// diff — there's no way to give each board a fully independent undo/redo
// stack without breaking cross-board atomic actions (e.g. duplicating a
// board node on the home board, which creates an entirely new child
// board's content in the same step — undoing it must revert both at once,
// which a per-board-sliced revert can't do correctly). The reducer/stack
// itself is therefore left exactly as it was pre-multiboard (one flat
// past/present/future of whole-Board snapshots) — every entry is just
// additionally tagged with the boardId the action was attributed to
// (ctx/notes/260917-multiboard-implementation-plan.md §4), and undo/redo
// are *gated*: they only act if the entry they'd act on belongs to the
// board currently being viewed. In practice (since only one board is ever
// editable at a time) this means undo/redo always affect whichever board
// was most recently edited, in true chronological order — editing board B
// after board A makes A's undo unavailable until A is edited again.

import { atom } from 'jotai'
import type { Board } from '../../schema/board'
import { ROOT_BOARD_ID } from '../../schema/boardMeta'
import { currentBoardIdAtom } from '../atoms/currentBoard'
import { selectionAtom } from '../atoms/selection'
import {
  createDebouncedSaver,
  type LoadResult,
  loadBoard,
} from '../persistence/storage'
import { reapableBoardIds, reapBoards } from '../reaper'
import {
  createHistoryState,
  type HistoryState,
  pushUpdate,
  redo as redoReducer,
  undo as undoReducer,
} from './reducer'

/** A Board snapshot plus which board's action produced it — the unit `reducer.ts`'s generic history stack is instantiated over here. */
interface AttributedBoard {
  board: Board
  boardId: string
}

const initialLoad: LoadResult = loadBoard()
const saver = createDebouncedSaver()

/** The result of the initial localStorage load — `ok: false` means a corrupt-data recovery happened. */
export const boardLoadResultAtom = atom<LoadResult>(initialLoad)

/** Gates autosave (spec §9/Q12) — starts true unless the initial load was a recovery. */
export const recoveryAcknowledgedAtom = atom(initialLoad.ok)

// On-load tombstone reaper (state/reaper.ts, design doc §5/§7): permanently
// frees a trashed board's content once its tombstone is old enough that an
// accidental delete has had ample time to be noticed. Applied directly to
// the initial board *before* history is created — reaping isn't a user
// action and must never itself become an undo step (undoing it would
// silently resurrect content the reaper just decided was safe to free).
// If nothing's reapable this is a no-op (same reference back).
const initialBoard = reapBoards(
  initialLoad.board,
  reapableBoardIds(initialLoad.board.boards, Date.now()),
)

export const boardHistoryAtom = atom<HistoryState<AttributedBoard>>(
  createHistoryState({ board: initialBoard, boardId: ROOT_BOARD_ID }),
)

export const boardAtom = atom(
  (get) => get(boardHistoryAtom).present.state.board,
)

function autosaveIfAcknowledged(
  get: (a: typeof recoveryAcknowledgedAtom) => boolean,
  board: Board,
): void {
  if (get(recoveryAcknowledgedAtom)) saver.save(board)
}

/**
 * Applies `updater` as the next undo step, attributed to `boardId` (the
 * board the action was performed from — design doc §5's attribution rule).
 * `restoreSelection` (spec §8/Q11) is only meaningful for actions like
 * delete, where undoing should re-select what was restored. A no-op
 * updater (returns the same Board reference) is dropped, same as before —
 * compared on the inner `board`, not the wrapper, since a fresh wrapper
 * object is constructed on every call regardless. Coalescing (the 400ms
 * rapid-fire window, spec §8/Q10) is forced off whenever `boardId` differs
 * from the present entry's own attribution — two rapid edits to different
 * boards must never merge into one entry (see reducer.ts's `forceNewEntry`
 * doc).
 */
export const updateBoardAtom = atom(
  null,
  (
    get,
    set,
    boardId: string,
    updater: (board: Board) => Board,
    restoreSelection?: readonly string[],
  ) => {
    const history = get(boardHistoryAtom)
    const nextBoard = updater(history.present.state.board)
    const nextHistory =
      nextBoard === history.present.state.board
        ? history
        : pushUpdate(
            history,
            { board: nextBoard, boardId },
            Date.now(),
            restoreSelection,
            boardId !== history.present.state.boardId,
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

/** Undoes the current board's own most recent action — a no-op if the top of the stack was attributed to a different board (i.e. that board was edited more recently than this one). */
export const undoBoardAtom = atom(null, (get, set) => {
  const history = get(boardHistoryAtom)
  if (history.present.state.boardId !== get(currentBoardIdAtom)) return
  const result = undoReducer(history)
  set(boardHistoryAtom, result.history)
  if (result.restoreSelection) {
    set(selectionAtom, new Set(result.restoreSelection))
  }
  autosaveIfAcknowledged(get, result.history.present.state.board)
})

/** Redoes the current board's own most recently undone action — a no-op if the next future entry was attributed to a different board. */
export const redoBoardAtom = atom(null, (get, set) => {
  const history = get(boardHistoryAtom)
  if (history.future[0]?.state.boardId !== get(currentBoardIdAtom)) return
  const nextHistory = redoReducer(history)
  set(boardHistoryAtom, nextHistory)
  autosaveIfAcknowledged(get, nextHistory.present.state.board)
})

/**
 * Replaces the whole board with an imported one (spec §9/Q14) — goes
 * through the normal `updateBoardAtom` history path, so an accidental
 * import is just another ⌘/Ctrl+Z away from being undone, same as any
 * other mutation. Attributed to whichever board was being viewed when the
 * import happened (import/export operate on the whole app document, per
 * ctx/notes/260917-multiboard-implementation-plan.md §1's Q1 — there's no
 * more specific board to attribute it to).
 */
export const loadImportedBoardAtom = atom(null, (get, set, board: Board) => {
  set(updateBoardAtom, get(currentBoardIdAtom), () => board)
})
