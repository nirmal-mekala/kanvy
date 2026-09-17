// `boards` collection read access + rename + create (multiboard support,
// ctx/notes/260917-multiboard-support-design.md §2/§3/§6). Board duplicate/
// delete land with the confirm-modal primitive (implementation plan
// Sub-phase 5).

import { atom } from 'jotai'
import { newBoardCard } from '../../cards/newCard'
import type { Board } from '../../schema/board'
import { ROOT_BOARD_ID } from '../../schema/boardMeta'
import { generateId } from '../../schema/legacy'
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

/**
 * Mints a fresh `boards` entry and a board-node referencing it at
 * `(x, y)`, in one atomic history step — design doc §3's "double-click on
 * root's canvas" creation path. Both writes happen together deliberately:
 * a board-node with no corresponding `boards` entry (or vice versa) is an
 * invariant violation, and a single step means undoing the creation
 * removes both at once rather than leaving an orphan behind mid-undo.
 * A no-op anywhere but the home board — `board` nodes are never creatable
 * on any other board (design doc §3); the UI additionally only ever
 * offers this action while viewing root, this is just the backstop.
 */
export const createBoardAtom = atom(null, (get, set, x: number, y: number) => {
  const currentBoardId = get(currentBoardIdAtom)
  if (currentBoardId !== ROOT_BOARD_ID) return
  const newBoardId = generateId()
  const now = new Date().toISOString()
  set(updateBoardAtom, currentBoardId, (board: Board) => ({
    ...board,
    boards: [
      ...board.boards,
      {
        id: newBoardId,
        title: 'Untitled board',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    ],
    nodes: [
      ...board.nodes,
      { ...newBoardCard(x, y, newBoardId), boardId: currentBoardId },
    ],
  }))
})
