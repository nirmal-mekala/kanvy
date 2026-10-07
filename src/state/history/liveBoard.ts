// The live, materialized Board document (`currentBoardAtom`) and the
// initial localStorage load that seeds it. Split out of ./boardHistoryAtom.ts
// (schema v6, ctx/notes/261006-root-board-isroot.md) so state/atoms/
// currentBoard.ts can derive the root board's id from the live document
// without a circular import — boardHistoryAtom.ts itself depends on
// currentBoard.ts (undo/redo gating), so currentBoard.ts can't depend back
// on it. This module depends on neither.

import { atom } from 'jotai'
import type { Board } from '../../schema/board'
import { type LoadResult, loadBoard } from '../persistence/storage'
import { reapEntities } from '../reaper'

export const initialLoad: LoadResult = loadBoard()

// On-load tombstone reaper (state/reaper.ts, design doc §5/§7; extended to
// nodes/edges/images by schema v4, ctx/notes/260921-action-based-undo-and-
// tombstoning.md): permanently frees trashed content once its tombstone is
// old enough that an accidental delete has had ample time to be noticed.
// Applied directly to the initial board *before* history is created —
// reaping isn't a user action and must never itself become an undo step
// (undoing it would silently resurrect content the reaper just decided
// was safe to free). If nothing's reapable this is a no-op (same
// reference back).
export const initialBoard = reapEntities(initialLoad.board, Date.now())

/** The live, materialized board — advanced by `updateBoardAtom`/undo/redo applying ops against it, not itself part of the undo stack (see boardHistoryAtom.ts's module comment). */
export const currentBoardAtom = atom<Board>(initialBoard)
