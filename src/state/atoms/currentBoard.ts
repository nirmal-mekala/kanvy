// Which board is currently being viewed/edited — read by every node/edge
// query and mutation atom to scope itself to one board's content, and by
// undo/redo to gate which history entries they're allowed to act on (see
// state/history/boardHistoryAtom.ts). Depends only on the live document
// (state/history/liveBoard.ts), never on boardHistoryAtom.ts or state/
// atoms/boards.ts, so both of those can depend on it without a circular
// import.
//
// Schema v6 (ctx/notes/261006-root-board-isroot.md): the home board has no
// fixed id any more, so "viewing home" can't be stored as an id — it's
// stored as `undefined` and resolved against whichever board is
// `isRoot` in the live document *at read time*. That keeps `/` correct
// across anything that replaces the document wholesale (a mode switch
// swaps in a different root id) without having to re-navigate.

import { atom } from 'jotai'
import { rootBoardId } from '../../schema/boardMeta'
import { currentBoardAtom } from '../history/liveBoard'

/** The live document's root (home) board id. */
export const rootBoardIdAtom = atom((get) =>
  rootBoardId(get(currentBoardAtom).boards),
)

/** The `/$boardId` route's board id, or `undefined` on the home route (`/`). */
const routeBoardIdAtom = atom<string | undefined>(undefined)

/**
 * The board being viewed. Write a board id to view that board, or
 * `undefined` to view the home board — router.tsx's `beforeLoad`s are the
 * app's writers.
 */
export const currentBoardIdAtom = atom(
  (get) => get(routeBoardIdAtom) ?? get(rootBoardIdAtom),
  (_get, set, boardId: string | undefined) => {
    set(routeBoardIdAtom, boardId)
  },
)
