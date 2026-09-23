// `boards` collection read access + rename + create (multiboard support,
// ctx/notes/260917-multiboard-support-design.md §2/§3/§6). Board duplicate/
// delete land with the confirm-modal primitive (implementation plan
// Sub-phase 5).

import { atom } from 'jotai'
import { newBoardCard } from '../../cards/newCard'
import { duplicateBoardNodes } from '../../clipboard/duplicateBoardNodes'
import { ROOT_BOARD_ID } from '../../schema/boardMeta'
import { generateId } from '../../schema/legacy'
import type { BoardCard } from '../../schema/node'
import { boardAtom, updateBoardAtom } from '../history/boardHistoryAtom'
import { nextNodeIndex } from '../liveEntities'
import type { Op } from '../ops'
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
    const meta = get(boardAtom).boards.find((b) => b.id === targetBoardId)
    if (!meta || meta.title === title) return
    const now = new Date().toISOString()
    set(updateBoardAtom, get(currentBoardIdAtom), [
      {
        kind: 'update',
        entity: 'board',
        id: targetBoardId,
        before: { title: meta.title, updatedAt: meta.updatedAt },
        after: { title, updatedAt: now },
      },
    ])
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
  const board = get(boardAtom)
  const ops: Op[] = [
    {
      kind: 'create',
      entity: 'board',
      value: {
        id: newBoardId,
        title: 'Untitled board',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      },
    },
    {
      kind: 'create',
      entity: 'node',
      value: {
        ...newBoardCard(x, y, newBoardId),
        boardId: currentBoardId,
        index: nextNodeIndex(board, currentBoardId),
      },
    },
  ]
  set(updateBoardAtom, currentBoardId, ops)
})

/**
 * Duplicates each of `boardNodes`' referenced board — content and all —
 * via `duplicateBoardNodes` (design doc §3), in one atomic history step
 * attributed to the current board. Takes the board-card objects directly
 * (not ids to look up on the live board): the ⌘/Ctrl+D caller has them
 * from the live selection, but the paste caller has them from an in-app
 * clipboard *snapshot* — the original board-node may since have been
 * deleted (its own board's content is untouched regardless, since a
 * board's content never depended on the shortcut card that pointed to
 * it). `offset` is the same uniform placement offset the caller computed
 * for the whole gesture's selection, so a board node duplicated/pasted
 * alongside ordinary nodes still displaces together as one visual unit.
 * Returns the new board-node cards themselves (not just ids) so the
 * caller can pan-into-view/select/focus them the same way it already does
 * for `duplicateNodes`/`pasteFromNodeClipboardAtom`'s results.
 */
export const duplicateBoardNodesAtom = atom(
  null,
  (get, set, boardNodes: readonly BoardCard[], offset: number): BoardCard[] => {
    if (boardNodes.length === 0) return []
    const board = get(boardAtom)
    const result = duplicateBoardNodes(boardNodes, board, offset)
    const currentBoardId = get(currentBoardIdAtom)
    // Deep-copied content for each newly-minted child board already
    // carries correct, dense `index` values (a 1:1 copy of its live
    // source board, same relative order) — only the new board-node cards
    // themselves need fresh indices, since they're being appended to the
    // *current* board's own live node set.
    let nextIndex = nextNodeIndex(board, currentBoardId)
    const nodeOps: Op[] = result.nodes.map((value) => ({
      kind: 'create',
      entity: 'node',
      value:
        value.boardId === currentBoardId
          ? { ...value, index: nextIndex++ }
          : value,
    }))
    const ops: Op[] = [
      ...result.boards.map(
        (value): Op => ({ kind: 'create', entity: 'board', value }),
      ),
      ...nodeOps,
      ...result.edges.map(
        (value): Op => ({ kind: 'create', entity: 'edge', value }),
      ),
    ]
    set(updateBoardAtom, currentBoardId, ops)
    return result.newBoardNodeCards
  },
)
