// `boards` collection read access + rename (multiboard support,
// ctx/notes/260917-multiboard-support-design.md §2/§3/§6). Board create/
// duplicate/delete live with the `board` card-kind UI (implementation plan
// Sub-phase 4) — this file only has what Sub-phase 3's navigation/
// breadcrumb needs.

import { atom } from 'jotai'
import type { Board } from '../../schema/board'
import { ROOT_BOARD_ID } from '../../schema/boardMeta'
import { boardAtom, updateBoardAtom } from '../history/boardHistoryAtom'
import { atomFamily } from './atomFamily'
import { currentBoardIdAtom } from './currentBoard'

export const boardsAtom = atom((get) => get(boardAtom).boards)

/** A single board's own metadata by id — see nodes.ts's `nodeFamily` for why this is a derived per-id atom rather than a primitive one. */
export const boardFamily = atomFamily((id: string) =>
  atom((get) => get(boardsAtom).find((board) => board.id === id)),
)

/**
 * Renames `targetBoardId` (writes `boards[targetBoardId].title`) — the
 * single source of truth both the on-canvas rename (a board-node's title
 * field, Sub-phase 4) and the breadcrumb rename (§6, this sub-phase) write
 * to. `targetBoardId` and the currently-viewed board (the entry this
 * mutation is attributed to for undo/redo purposes) aren't always the same
 * board: renaming a board-node from the home board targets a *different*
 * board than the one you're acting from, while the breadcrumb always
 * targets the board you're currently viewing. A no-op for the reserved
 * root board — its title is fixed (design doc §2/§7); the UI additionally
 * hides/disables the rename control there, this is just the backstop.
 */
export const renameBoardAtom = atom(
  null,
  (get, set, targetBoardId: string, title: string) => {
    if (targetBoardId === ROOT_BOARD_ID) return
    const now = new Date().toISOString()
    set(updateBoardAtom, get(currentBoardIdAtom), (board: Board) => {
      let changed = false
      const boards = board.boards.map((meta) => {
        if (meta.id !== targetBoardId || meta.title === title) return meta
        changed = true
        return { ...meta, title, updatedAt: now }
      })
      return changed ? { ...board, boards } : board
    })
  },
)
